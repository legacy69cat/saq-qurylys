import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {Database as DatabaseSync} from '../src/server/db/connection';
import { openDatabase } from "../src/server/db/connection";
import { migrate } from "../src/server/db/migrations";
import { seedDemo } from "../src/server/db/seed";
import { addManualHypothesis, addPublication, createSignal, finishAnalysis, projectById, reviewHypothesis, reviewSignal, saveLegalCheck, signalById, startAnalysis, workflowForProject } from "../src/server/db/workflow";
import { parseAnalysis } from "../src/domain/analysis";
let db: DatabaseSync;
beforeEach(async () => { db = (await openDatabase(":memory:")); (await migrate(db)); (await seedDemo(db)); });
afterEach(() => db.close());
const pub = { requestId: "new-ad", projectId: "demo-g", actor: "Тестовый аналитик", platform: "Учебный сайт", account: "demo", url: "https://example.invalid/new", publishedAt: "2026-10-14", text: "Контур 07 строится. Внесите депозит 300 000 ₸ за квартиру." };
const analysis = { summary: "Два возможных признака", suggestions: [
        { code: "R2" as const, quote: "Внесите депозит 300 000 ₸", explanation: "Прямое предложение оплаты", confidence: .9 },
        { code: "R3" as const, quote: "Контур 07 строится.", explanation: "Реклама строящегося объекта", confidence: .8 },
    ] };
async function analyzed() {
    (await addPublication(db, pub));
    const run = (await startAnalysis(db, "new-ad", "Автор", "test/model", "test-1"));
    (await finishAnalysis(db, run, analysis));
    return (await workflowForProject(db, "demo-g")).suggestions;
}
describe("full analyst workflow", () => {
    it("new text → hypotheses → human confirmation → 70/red → return → version 2 → confirmation", async () => {
        expect((await projectById(db, "demo-g")).risk.score).toBe(35);
        const hypotheses = (await analyzed());
        expect((await projectById(db, "demo-g")).risk.score).toBe(35);
        expect((await projectById(db, "demo-g")).risk.needsReview).toBe(true);
        for (const item of hypotheses)
            (await reviewHypothesis(db, item.id, "confirmed", "Аналитик"));
        expect((await projectById(db, "demo-g")).risk).toMatchObject({ score: 70, zone: "red" });
        const id = (await createSignal(db, "demo-g", "Автор сигнала", "signal-one"));
        expect((await signalById(db, id)).status).toBe("pending");
        (await expect(async () => (await reviewSignal(db, id, "returned", "Проверяющий", ""))).rejects.toThrow(/Причина возврата/));
        (await reviewSignal(db, id, "returned", "Проверяющий", "Проверить источник"));
        const next = (await createSignal(db, "demo-g", "Автор сигнала", "signal-two"));
        expect((await signalById(db, next)).version).toBe(2);
        (await reviewSignal(db, next, "confirmed", "Проверяющий", "Проверено"));
        expect((await signalById(db, next))).toMatchObject({ status: "confirmed", reviewed_by: "Проверяющий", comment: "Проверено" });
        expect((await workflowForProject(db, "demo-g")).events.some((e) => e.action === "Сигнал возвращён")).toBe(true);
        expect((await signalById(db, id)).status).toBe("returned");
    });
    it("rejecting a hypothesis adds no points and cannot reverse an already recorded decision", async () => {
        const hypotheses = (await analyzed());
        (await reviewHypothesis(db, hypotheses[0].id, "rejected", "Аналитик"));
        expect((await projectById(db, "demo-g")).risk.score).toBe(35);
        (await expect(async () => (await reviewHypothesis(db, hypotheses[0].id, "confirmed", "Другой"))).rejects.toThrow(/уже принято/));
    });
    it("double submission does not duplicate publications, decisions or signal versions", async () => {
        const hypotheses = (await analyzed());
        (await addPublication(db, pub));
        expect((await db.prepare("SELECT COUNT(*) AS n FROM publications").get())?.n).toBe(13);
        (await reviewHypothesis(db, hypotheses[0].id, "confirmed", "Аналитик"));
        const count = (await workflowForProject(db, "demo-g")).events.length;
        (await reviewHypothesis(db, hypotheses[0].id, "confirmed", "Аналитик"));
        expect((await workflowForProject(db, "demo-g")).events).toHaveLength(count);
        expect((await createSignal(db, "demo-g", "Автор", "signal-one"))).toBe("signal-one");
        expect((await createSignal(db, "demo-g", "Автор", "signal-one"))).toBe("signal-one");
        expect((await createSignal(db, "demo-g", "Автор", "another-request"))).toBe("signal-one");
        (await reviewSignal(db, "signal-one", "confirmed", "Автор", ""));
        (await reviewSignal(db, "signal-one", "confirmed", "Автор", ""));
        expect((await workflowForProject(db, "demo-g")).signals).toHaveLength(1);
    });
    it("old pending snapshots cannot be confirmed and approved snapshots never mutate", async () => {
        (await createSignal(db, "demo-g", "Автор", "stale"));
        const original = (await signalById(db, "stale")).snapshot;
        (await analyzed());
        (await expect(async () => (await reviewSignal(db, "stale", "confirmed", "Автор", ""))).rejects.toThrow(/изменились/));
        expect((await signalById(db, "stale")).snapshot).toBe(original);
        (await reviewSignal(db, "stale", "returned", "Автор", "Обновить материалы"));
        (await createSignal(db, "demo-g", "Автор", "fresh"));
        (await reviewSignal(db, "fresh", "confirmed", "Автор", ""));
        const approved = (await signalById(db, "fresh")).snapshot;
        const item = (await workflowForProject(db, "demo-g")).suggestions[0];
        (await reviewHypothesis(db, item.id, "confirmed", "Автор"));
        expect((await signalById(db, "fresh")).snapshot).toBe(approved);
    });
    it("manual fallback persists a quote without calling AI", async () => {
        (await addPublication(db, pub));
        const data = { requestId: "manual", publicationId: "new-ad", actor: "Автор", ...analysis.suggestions[0] };
        (await addManualHypothesis(db, data));
        (await addManualHypothesis(db, data));
        expect((await workflowForProject(db, "demo-g")).suggestions).toHaveLength(1);
        expect((await workflowForProject(db, "demo-g")).suggestions[0]).toMatchObject({ origin: "manual", confidence: null, status: "proposed" });
        expect((await projectById(db, "demo-g")).risk.score).toBe(35);
        (await reviewHypothesis(db, "manual", "confirmed", "Автор"));
        expect((await projectById(db, "demo-g")).risk.score).toBe(60);
    });
    it("unknown registry result never gives R1 and present guarantee removes R1", async () => {
        const data = { requestId: "legal1", projectId: "demo-g", actor: "Автор", source: "Учебная проверка", url: "https://example.invalid/registry", text: "Нет результатов поиска", status: "unknown" };
        (await saveLegalCheck(db, data));
        expect((await projectById(db, "demo-g")).risk.score).toBe(0);
        (await expect(async () => (await saveLegalCheck(db, { ...data, requestId: "legal2", status: "absent" }))).rejects.toThrow(/всех применимых/));
        (await saveLegalCheck(db, { ...data, requestId: "legal3", status: "absent", verifiedAbsence: "yes", text: "Документированная учебная проверка всех оснований" }));
        expect((await projectById(db, "demo-g")).risk.score).toBe(35);
        (await saveLegalCheck(db, { ...data, requestId: "legal4", status: "present", basisType: "guarantee", text: "Гарантия подтверждена" }));
        expect((await projectById(db, "demo-g")).risk.score).toBe(0);
    });
});
describe("validation and failures", () => {
    it("upgrades a version-1 database without changing stored project data", async () => {
        (await db.prepare("UPDATE evidence SET text = 'Saved analyst edit' WHERE id = 'demo-g-ad-1'").run());
        (await db.exec("DROP TABLE audit_events; DROP TABLE signals; DROP TABLE suggestions; DROP TABLE analysis_runs; DELETE FROM schema_migrations WHERE version = 2;"));
        (await expect(async () => (await projectById(db, "demo-g"))).rejects.toThrow(/db:setup/));
        (await migrate(db));
        expect((await projectById(db, "demo-g")).evidence.find((item) => item.id === "demo-g-ad-1")?.text).toBe("Saved analyst edit");
        expect((await workflowForProject(db, "demo-g")).signals).toEqual([]);
    });
    it("recovers an interrupted analysis after its lease expires", async () => {
        (await addPublication(db, pub));
        const old = (await startAnalysis(db, "new-ad", "Автор", "test/model", "test-1"));
        (await db.prepare("UPDATE analysis_runs SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(old));
        const fresh = (await startAnalysis(db, "new-ad", "Автор", "test/model", "test-1"));
        expect(fresh).not.toBe(old);
        (await expect(async () => (await finishAnalysis(db, old, analysis))).rejects.toThrow(/устарел/));
        (await finishAnalysis(db, fresh, analysis));
        expect((await workflowForProject(db, "demo-g")).suggestions).toHaveLength(2);
    });
    it.each(["javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.com"])("rejects unsafe URL %s", async (url) => {
        (await expect(async () => (await addPublication(db, { ...pub, url }))).rejects.toThrow());
        expect((await db.prepare("SELECT COUNT(*) AS n FROM publications").get())?.n).toBe(12);
    });
    it("rejects missing actor, future date and non-existent project", async () => {
        for (const data of [{ actor: " " }, { publishedAt: "2099-01-01" }, { projectId: "missing" }, { text: " " }])
            (await expect(async () => (await addPublication(db, { ...pub, ...data }))).rejects.toThrow());
        expect((await db.prepare("SELECT COUNT(*) AS n FROM evidence WHERE id = 'new-ad'").get())?.n).toBe(0);
    });
    it("does not allow reusing an id with different input", async () => {
        (await addPublication(db, pub));
        (await expect(async () => (await addPublication(db, { ...pub, text: "Другая публикация" }))).rejects.toThrow(/уже использована/));
    });
    it("invalid AI quotes roll back atomically, failure leaves saved text and permits retry", async () => {
        (await addPublication(db, pub));
        const id = (await startAnalysis(db, "new-ad", "Автор", "test/model", "test-1"));
        (await expect(async () => (await startAnalysis(db, "new-ad", "Автор", "test/model", "test-1"))).rejects.toThrow(/уже выполняется/));
        (await expect(async () => (await finishAnalysis(db, id, { ...analysis, suggestions: [...analysis.suggestions, { ...analysis.suggestions[0], quote: "выдуманная цитата" }] }))).rejects.toThrow());
        expect((await workflowForProject(db, "demo-g")).suggestions).toHaveLength(0);
        (await finishAnalysis(db, id, null, "Тайм-аут"));
        expect((await db.prepare("SELECT text FROM evidence WHERE id = 'new-ad'").get())?.text).toBe(pub.text);
        await expect(startAnalysis(db, "new-ad", "Автор", "test/model", "test-1")).resolves.toEqual(expect.any(String));
    });
    it("completed immutable publications are not billed again", async () => {
        (await analyzed());
        (await expect(async () => (await startAnalysis(db, "new-ad", "Автор", "test/model", "test-1"))).rejects.toThrow(/уже проанализирована/));
    });
    it("signals require positive confirmed evidence and a reviewer", async () => {
        (await expect(async () => (await createSignal(db, "demo-e", "Автор", "no-facts"))).rejects.toThrow(/подтверждённый/));
        (await expect(async () => (await createSignal(db, "demo-g", "", "no-actor"))).rejects.toThrow());
    });
    it("rejects illegal model factor, invented quote, duplicate code and confidence outside bounds", () => {
        for (const item of [{ ...analysis.suggestions[0], code: "R1" }, { ...analysis.suggestions[0], quote: "Выдумано" }, { ...analysis.suggestions[0], confidence: 2 }]) {
            expect(() => parseAnalysis({ summary: "Test", suggestions: [item] }, pub.text)).toThrow();
        }
        expect(() => parseAnalysis({ summary: "Test", suggestions: [analysis.suggestions[0], analysis.suggestions[0]] }, pub.text)).toThrow();
        expect(parseAnalysis({ summary: "Нет оплаты", suggestions: [] }, "Бронь бесплатно").suggestions).toEqual([]);
    });
    it("pending hypotheses retain source links without scoring", async () => {
        (await analyzed());
        const factor = (await projectById(db, "demo-g")).risk.factors.find((item) => item.code === "R2")!;
        expect(factor).toMatchObject({ points: 0, needsReview: true });
        expect(factor.evidenceIds).toContain("new-ad");
    });
});

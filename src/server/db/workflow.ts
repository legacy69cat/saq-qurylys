import { createHash, randomUUID } from "node:crypto";
import type {Database as DatabaseSync} from './connection';
import { InputError, httpUrl, isoDate, parseAnalysis, required, type Analysis } from "../../domain/analysis";
import { listProjects, type Project } from "./projects";
const now = () => new Date().toISOString();
async function transaction<T>(db: DatabaseSync, work: () => T | Promise<T>): Promise<T> {
    if (db.isTransaction)
        return work();
    (await db.exec("BEGIN IMMEDIATE"));
    try {
        const result = await work();
        (await db.exec("COMMIT"));
        return result;
    }
    catch (error) {
        (await db.exec("ROLLBACK"));
        throw error;
    }
}
async function audit(db: DatabaseSync, projectId: string, actor: string, action: string, detail: string) {
    (await db.prepare("INSERT INTO audit_events VALUES (?, ?, ?, ?, ?, ?)").run(randomUUID(), projectId, actor, action, detail, now()));
}
export async function projectById(db: DatabaseSync, id: string): Promise<Project> {
    const project = (await listProjects(db)).find((item) => item.id === id);
    if (!project)
        throw new InputError("ЖК не найден.");
    return project;
}
export interface Publication {
    id: string;
    projectId: string;
    evidenceId: string;
    platform: string;
    account: string;
    publishedAt: string;
    text: string;
    url: string | null;
    capturedAt: string;
}
export async function publicationById(db: DatabaseSync, id: string): Promise<Publication> {
    const publication = (await db.prepare(`SELECT p.id, p.project_id AS projectId, p.evidence_id AS evidenceId, p.platform, p.account,
    p.published_at AS publishedAt, e.text, e.url, e.captured_at AS capturedAt
    FROM publications p JOIN evidence e ON e.id = p.evidence_id WHERE p.id = ?`).get(id)) as unknown as Publication | undefined;
    if (!publication)
        throw new InputError("Публикация не найдена.");
    return publication;
}
export async function addPublication(db: DatabaseSync, data: Record<string, unknown>) {
    const id = required(data.requestId, "Идентификатор", 100);
    const projectId = required(data.projectId, "ЖК");
    const project = (await projectById(db, projectId));
    const actor = required(data.actor, "Автор");
    const text = required(data.text, "Текст", 12000);
    const platform = required(data.platform, "Площадка");
    const account = required(data.account, "Аккаунт/источник");
    const url = httpUrl(data.url);
    const publishedAt = isoDate(data.publishedAt);
    return (await transaction(db, async () => {
        const existing = (await db.prepare("SELECT id FROM publications WHERE id = ?").get(id));
        if (existing) {
            const old = (await publicationById(db, id));
            if (old.projectId !== projectId || old.text !== text || old.url !== url || old.platform !== platform || old.account !== account || old.publishedAt !== publishedAt)
                throw new InputError("Форма уже использована. Обновите страницу.");
            return id;
        }
        (await db.prepare("INSERT INTO evidence VALUES (?, ?, 'publication', ?, ?, ?, ?, ?)").run(id, projectId, `${platform} · ${account}`, url, text, now(), Number(project.isDemo)));
        (await db.prepare("INSERT INTO publications VALUES (?, ?, ?, ?, ?, ?, 'confirmed')").run(id, projectId, id, platform, account, publishedAt));
        (await audit(db, projectId, actor, "Публикация добавлена и привязана", id));
        return id;
    }));
}
export interface Hypothesis {
    id: string;
    publication_id: string;
    code: "R2" | "R3";
    quote: string;
    explanation: string;
    confidence: number | null;
    origin: "ai" | "manual";
    status: "proposed" | "confirmed" | "rejected";
    reviewed_by: string | null;
    reviewed_at: string | null;
}
export interface AnalysisRun {
    id: string;
    publication_id: string;
    status: string;
    model: string;
    summary: string | null;
    error: string | null;
    created_at: string;
}
export async function workflowForProject(db: DatabaseSync, projectId: string) {
    return {
        suggestions: (await db.prepare("SELECT s.* FROM suggestions s JOIN publications p ON p.id = s.publication_id WHERE p.project_id = ? ORDER BY s.created_at, s.id").all(projectId)) as unknown as Hypothesis[],
        runs: (await db.prepare("SELECT r.* FROM analysis_runs r JOIN publications p ON p.id = r.publication_id WHERE p.project_id = ? ORDER BY r.created_at DESC, r.id").all(projectId)) as unknown as AnalysisRun[],
        signals: (await db.prepare("SELECT id, version, status, created_at FROM signals WHERE project_id = ? ORDER BY version DESC").all(projectId)) as unknown as {
            id: string;
            version: number;
            status: Signal["status"];
            created_at: string;
        }[],
        events: (await db.prepare("SELECT actor, action, detail, created_at FROM audit_events WHERE project_id = ? ORDER BY created_at DESC, rowid DESC").all(projectId)) as unknown as {
            actor: string;
            action: string;
            detail: string;
            created_at: string;
        }[],
    };
}
export async function startAnalysis(db: DatabaseSync, publicationId: string, actorInput: string, model: string, promptVersion: string) {
    const actor = required(actorInput, "Автор");
    const publication = (await publicationById(db, publicationId));
    return (await transaction(db, async () => {
        (await db.prepare("UPDATE analysis_runs SET status = 'failed', error = 'Прерванный анализ. Повторите запрос.', finished_at = ? WHERE publication_id = ? AND status = 'running' AND created_at < ?")
            .run(now(), publicationId, new Date(Date.now() - 120000).toISOString()));
        if ((await db.prepare("SELECT id FROM analysis_runs WHERE publication_id = ? AND status = 'running'").get(publicationId)))
            throw new InputError("Анализ уже выполняется. Обновите страницу через несколько секунд.");
        const previous = (await db.prepare("SELECT id FROM analysis_runs WHERE publication_id = ? AND status = 'completed'").get(publicationId));
        if (previous)
            throw new InputError("Эта неизменяемая публикация уже проанализирована. Проверьте сохранённые гипотезы.");
        const id = randomUUID();
        (await db.prepare("INSERT INTO analysis_runs (id, publication_id, status, model, prompt_version, actor, created_at) VALUES (?, ?, 'running', ?, ?, ?, ?)").run(id, publicationId, model, promptVersion, actor, now()));
        (await audit(db, publication.projectId, actor, "ИИ-анализ запущен", publicationId));
        return id;
    }));
}
export async function finishAnalysis(db: DatabaseSync, runId: string, output: Analysis | null, error?: string) {
    return (await transaction(db, async () => {
        const run = (await db.prepare("SELECT * FROM analysis_runs WHERE id = ?").get(runId)) as {
            publication_id: string;
            actor: string;
            status: string;
        } | undefined;
        if (!run || run.status !== "running")
            throw new InputError("Анализ уже завершён или устарел.");
        const publication = (await publicationById(db, run.publication_id));
        const analysis = output ? parseAnalysis(output, publication.text) : null;
        if (analysis)
            for (const item of analysis.suggestions) {
                (await db.prepare("INSERT INTO suggestions (id, publication_id, run_id, code, quote, explanation, confidence, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ai', ?)")
                    .run(randomUUID(), publication.id, runId, item.code, item.quote, item.explanation, item.confidence, now()));
            }
        (await db.prepare("UPDATE analysis_runs SET status = ?, summary = ?, error = ?, finished_at = ? WHERE id = ?")
            .run(analysis ? "completed" : "failed", analysis?.summary ?? null, analysis ? null : (error || "Ошибка анализа"), now(), runId));
        (await audit(db, publication.projectId, run.actor, analysis ? "ИИ-анализ завершён" : "Ошибка ИИ-анализа", publication.id));
    }));
}
export async function addManualHypothesis(db: DatabaseSync, data: Record<string, unknown>) {
    const id = required(data.requestId, "Идентификатор");
    const pub = (await publicationById(db, required(data.publicationId, "Публикация")));
    const actor = required(data.actor, "Автор");
    const analysis = parseAnalysis({ summary: "Ручная проверка", suggestions: [{ code: data.code, quote: data.quote, explanation: data.explanation, confidence: 1 }] }, pub.text);
    const item = analysis.suggestions[0];
    return (await transaction(db, async () => {
        const old = (await db.prepare("SELECT publication_id, code, quote, explanation FROM suggestions WHERE id = ?").get(id));
        if (old) {
            if (old.publication_id !== pub.id || old.code !== item.code || old.quote !== item.quote || old.explanation !== item.explanation)
                throw new InputError("Форма уже использована. Обновите страницу.");
            return;
        }
        (await db.prepare("INSERT INTO suggestions (id, publication_id, code, quote, explanation, origin, created_at) VALUES (?, ?, ?, ?, ?, 'manual', ?)").run(id, pub.id, item.code, item.quote, item.explanation, now()));
        (await audit(db, pub.projectId, actor, "Ручная гипотеза добавлена", `${item.code}: ${item.quote}`));
    }));
}
export async function reviewHypothesis(db: DatabaseSync, id: string, decision: string, actorInput: string) {
    if (!["confirmed", "rejected"].includes(decision))
        throw new InputError("Недопустимое решение.");
    const actor = required(actorInput, "Автор");
    return (await transaction(db, async () => {
        const item = (await db.prepare("SELECT * FROM suggestions WHERE id = ?").get(id)) as unknown as Hypothesis | undefined;
        if (!item)
            throw new InputError("Гипотеза не найдена.");
        if (item.status === decision)
            return;
        if (item.status !== "proposed")
            throw new InputError("Решение уже принято. Обновите страницу.");
        const pub = (await publicationById(db, item.publication_id));
        if (!pub.text.includes(item.quote))
            throw new InputError("Цитата не совпадает с источником.");
        if (decision === "confirmed" && item.code === "R3" && (await projectById(db, pub.projectId)).stage !== "construction")
            throw new InputError("Объект введён: R3 неприменим.");
        const date = now();
        if (decision === "confirmed") {
            (await db.prepare("INSERT INTO reviewers VALUES (?, ?, 0) ON CONFLICT(id) DO NOTHING").run(actor, actor));
            const previousFactor = (await db.prepare("SELECT id, status FROM factors WHERE project_id = ? AND code = ?").get(pub.projectId, item.code));
            if (previousFactor && previousFactor.status !== "confirmed")
                (await db.prepare("DELETE FROM factor_evidence WHERE factor_id = ?").run(previousFactor.id));
            (await db.prepare(`INSERT INTO factors VALUES (?, ?, ?, 'confirmed', ?, ?) ON CONFLICT(project_id, code)
        DO UPDATE SET status = 'confirmed', reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`).run(randomUUID(), pub.projectId, item.code, actor, date));
            const factor = (await db.prepare("SELECT id FROM factors WHERE project_id = ? AND code = ?").get(pub.projectId, item.code))!;
            (await db.prepare("INSERT INTO factor_evidence VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(factor.id, pub.evidenceId, pub.projectId));
        }
        (await db.prepare("UPDATE suggestions SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?").run(decision, actor, date, id));
        (await audit(db, pub.projectId, actor, decision === "confirmed" ? "Гипотеза подтверждена" : "Гипотеза отклонена", `${item.code}: ${item.quote}`));
    }));
}
export async function saveLegalCheck(db: DatabaseSync, data: Record<string, unknown>) {
    const projectId = required(data.projectId, "ЖК");
    const project = (await projectById(db, projectId));
    const actor = required(data.actor, "Автор");
    const source = required(data.source, "Источник");
    const url = httpUrl(data.url);
    const text = required(data.text, "Результат проверки", 12000);
    const status = data.status;
    if (!["unknown", "present", "absent"].includes(String(status)))
        throw new InputError("Некорректный статус основания.");
    const type = status === "unknown" ? "unknown" : status === "absent" ? "none" : data.basisType;
    if (!["unknown", "none", "guarantee", "mio_permission", "other"].includes(String(type)) || (status === "present" && !["guarantee", "mio_permission", "other"].includes(String(type))))
        throw new InputError("Укажите вид подтверждённого основания.");
    if (status === "absent" && data.verifiedAbsence !== "yes")
        throw new InputError("Подтвердите проверку всех применимых оснований. Отсутствие записи в поиске недостаточно.");
    const id = required(data.requestId, "Идентификатор");
    return (await transaction(db, async () => {
        if ((await db.prepare("SELECT id FROM evidence WHERE id = ?").get(id)))
            throw new InputError("Проверка уже сохранена. Обновите страницу.");
        const date = now();
        (await db.prepare("INSERT INTO reviewers VALUES (?, ?, 0) ON CONFLICT DO NOTHING").run(actor, actor));
        (await db.prepare("INSERT INTO evidence VALUES (?, ?, 'legal', ?, ?, ?, ?, ?)").run(id, projectId, source, url, text, date, Number(project.isDemo)));
        (await db.prepare(`INSERT INTO legal_checks VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET
      basis_type = excluded.basis_type, status = excluded.status, evidence_id = excluded.evidence_id,
      reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`).run(projectId, String(type), String(status), id, actor, date));
        (await db.prepare(`INSERT INTO factors VALUES (?, ?, 'R1', ?, ?, ?) ON CONFLICT(project_id, code) DO UPDATE SET
      status = excluded.status, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`).run(randomUUID(), projectId, status === "absent" ? "confirmed" : status === "unknown" ? "unknown" : "rejected", actor, date));
        const factor = (await db.prepare("SELECT id FROM factors WHERE project_id = ? AND code = 'R1'").get(projectId))!;
        (await db.prepare("DELETE FROM factor_evidence WHERE factor_id = ?").run(factor.id));
        (await db.prepare("INSERT INTO factor_evidence VALUES (?, ?, ?)").run(factor.id, id, projectId));
        (await audit(db, projectId, actor, "Правовое основание проверено", `${status} · ${source} · ${text}`));
    }));
}
export interface Signal {
    id: string;
    project_id: string;
    version: number;
    snapshot: string;
    fingerprint: string;
    status: "pending" | "confirmed" | "returned";
    created_by: string;
    created_at: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    comment: string | null;
}
export const fingerprint = (project: Project) => createHash("sha256").update(JSON.stringify(project)).digest("hex");
export async function signalById(db: DatabaseSync, id: string): Promise<Signal> {
    const signal = (await db.prepare("SELECT * FROM signals WHERE id = ?").get(id)) as unknown as Signal | undefined;
    if (!signal)
        throw new InputError("Сигнал не найден.");
    return signal;
}
export async function createSignal(db: DatabaseSync, projectId: string, actorInput: string, requestId: string) {
    const actor = required(actorInput, "Автор");
    const id = required(requestId, "Идентификатор");
    return (await transaction(db, async () => {
        const previous = (await db.prepare("SELECT id, project_id FROM signals WHERE id = ?").get(id));
        if (previous) {
            if (previous.project_id !== projectId)
                throw new InputError("Некорректный идентификатор сигнала.");
            return id;
        }
        const pending = (await db.prepare("SELECT id FROM signals WHERE project_id = ? AND status = 'pending'").get(projectId));
        if (pending)
            return String(pending.id);
        const project = (await projectById(db, projectId));
        if (!project.risk.factors.some((factor) => factor.counted))
            throw new InputError("Для сигнала нужен хотя бы один подтверждённый фактор с доказательствами.");
        const version = Number((await db.prepare("SELECT COALESCE(MAX(version), 0) AS n FROM signals WHERE project_id = ?").get(projectId))!.n) + 1;
        (await db.prepare("INSERT INTO signals (id, project_id, version, snapshot, fingerprint, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)")
            .run(id, projectId, version, JSON.stringify(project), fingerprint(project), actor, now()));
        (await audit(db, projectId, actor, "Сигнал создан", `Версия ${version} · ${project.risk.score} баллов · ${id}`));
        return id;
    }));
}
export async function reviewSignal(db: DatabaseSync, id: string, decision: string, actorInput: string, commentInput: string) {
    if (!["confirmed", "returned"].includes(decision))
        throw new InputError("Недопустимое решение.");
    const actor = required(actorInput, "Автор");
    const comment = decision === "returned" ? required(commentInput, "Причина возврата", 2000) : commentInput.trim();
    if (comment.length > 2000)
        throw new InputError("Комментарий слишком длинный.");
    return (await transaction(db, async () => {
        const signal = (await signalById(db, id));
        if (signal.status === decision)
            return;
        if (signal.status !== "pending")
            throw new InputError("По этой версии решение уже принято. Создайте новую версию.");
        if (decision === "confirmed" && signal.fingerprint !== fingerprint((await projectById(db, signal.project_id))))
            throw new InputError("Данные ЖК изменились. Верните сигнал и создайте новую версию.");
        (await db.prepare("UPDATE signals SET status = ?, reviewed_by = ?, reviewed_at = ?, comment = ? WHERE id = ?").run(decision, actor, now(), comment, id));
        (await audit(db, signal.project_id, actor, decision === "confirmed" ? "Сигнал подтверждён" : "Сигнал возвращён", `Версия ${signal.version} · ${comment}`));
    }));
}

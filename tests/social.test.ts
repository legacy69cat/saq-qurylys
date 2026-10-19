import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type {Database as DatabaseSync} from '../src/server/db/connection';
import { openDatabase } from "../src/server/db/connection";
import { migrate } from "../src/server/db/migrations";
import { actorInput, normalizePost, parseSearch } from "../src/domain/social";
import { createSearch, enqueue, claimNext, attachRun, jobs, completeJob, posts, acknowledgeUncertain, enableSearch } from "../src/server/db/social";
import { ApifyClient, ApifyError } from "../src/server/social/apify";
import { collectTick } from "../src/server/social/collector";
let db: DatabaseSync;
const search = { city: "Усть-Каменогорск", keywords: "новостройки", platform: "tiktok", resultLimit: 5, intervalHours: 24 };
const row = { id: "123", webVideoUrl: "https://www.tiktok.com/@builder/video/123?tracking=1", text: "Квартиры", createTimeISO: "2025-01-01T10:00:00Z", authorMeta: { name: "builder" } };
beforeEach(async () => { db = (await openDatabase(":memory:")); (await migrate(db)); });
afterEach(() => { db.close(); vi.restoreAllMocks(); });
describe("social monitoring", () => {
    it("validates limits and generates platform-specific city searches", () => {
        expect(actorInput(parseSearch(search))).toMatchObject({ searchQueries: ["новостройки Усть-Каменогорск"], resultsPerPage: 5 });
        expect(actorInput(parseSearch({ ...search, platform: "instagram" }))).toMatchObject({ searchType: "popular", searchLimit: 5, search: "новостройки Усть Каменогорск" });
        expect(actorInput(parseSearch({ ...search, platform: "facebook" }))).toMatchObject({ searchType: "posts", maxResults: 5 });
        for (const patch of [{ resultLimit: 0 }, { resultLimit: 51 }, { platform: "other" }, { intervalHours: 0 }, { city: "" }, { keywords: "a,b" }])
            expect(() => parseSearch({ ...search, ...patch })).toThrow();
    });
    it("rejects unsafe URLs and non-posts, strips tracking and does not invent dates", () => {
        expect(normalizePost("tiktok", row)?.url).toBe("https://www.tiktok.com/@builder/video/123");
        for (const url of ["https://tiktok.com.evil.test/@x/video/123", "javascript:alert(1)", "https://www.tiktok.com/@person", "https://x:y@tiktok.com/@x/video/123"])
            expect(normalizePost("tiktok", { ...row, webVideoUrl: url })).toBeNull();
        expect(normalizePost("instagram", { url: "https://www.instagram.com/p/abc/", caption: "Текст", timestamp: "3 days ago" })?.publishedAt).toBeNull();
        expect(normalizePost("facebook", { id: "3", postUrl: "https://www.facebook.com/a/posts/3", text: "Текст", textTruncated: true })?.truncated).toBe(true);
        expect(normalizePost("instagram", { error: "no_items" })).toBeNull();
    });
    it("deduplicates jobs and publications across runs and preserves the first captured text", async () => {
        const id = (await createSearch(db, search));
        expect((await createSearch(db, search))).toBe(id);
        const job = (await enqueue(db, id));
        expect((await enqueue(db, id))).toBe(job);
        expect((await claimNext(db))?.id).toBe(job);
        expect((await claimNext(db))).toBeNull();
        (await attachRun(db, job, "run1", "data1"));
        (await completeJob(db, (await jobs(db))[0], "tiktok", [row, row, { error: "no_items" }], 0.02));
        expect((await jobs(db))[0]).toMatchObject({ received: 3, imported: 1, skipped: 1, status: "succeeded" });
        const second = (await enqueue(db, id));
        (await claimNext(db));
        (await attachRun(db, second, "run2", "data2"));
        (await completeJob(db, (await jobs(db)).find((j) => j.id === second)!, "tiktok", [{ ...row, text: "Изменено" }]));
        expect((await posts(db))).toHaveLength(1);
        expect((await posts(db))[0].text).toBe("Квартиры");
        expect((await db.prepare("SELECT COUNT(*) AS n FROM collection_matches").get())?.n).toBe(2);
        expect((await db.prepare("SELECT COUNT(*) AS n FROM factors").get())?.n).toBe(0);
    });
    it("reserves a daily budget atomically, including failed and uncertain runs", async () => {
        for (let i = 0; i < 6; i++) {
            const id = (await createSearch(db, { ...search, platform: "facebook", keywords: `Запрос ${i}` }));
            (await enqueue(db, id));
            expect(Boolean((await claimNext(db)))).toBe(i < 5);
        }
        expect((await jobs(db)).filter((j) => j.status === "starting")).toHaveLength(5);
        expect((await jobs(db)).find((j) => j.status === "queued")?.error).toMatch(/бюджет/);
    });
    it("does not repeat a crashed start and requires explicit reconciliation", async () => {
        const id = (await createSearch(db, search));
        const job = (await enqueue(db, id));
        (await claimNext(db));
        (await db.prepare("UPDATE collection_jobs SET updated_at='2000-01-01T00:00:00Z' WHERE id=?").run(job));
        expect((await claimNext(db))).toBeNull();
        expect((await jobs(db))[0].status).toBe("uncertain");
        expect((await enqueue(db, id))).toBe(job);
        (await acknowledgeUncertain(db, job));
        expect((await enqueue(db, id))).not.toBe(job);
    });
    it("schedules, starts, polls and imports through the real client contract with mocked HTTP", async () => {
        const id = (await createSearch(db, search));
        (await enableSearch(db, id, true));
        const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: { id: "run1", status: "RUNNING", defaultDatasetId: "data1" } })).mockResolvedValueOnce(Response.json({ data: { id: "run1", status: "SUCCEEDED", defaultDatasetId: "data1", usageTotalUsd: 0.01 } })).mockResolvedValueOnce(Response.json([row]));
        const client = new ApifyClient("test-token", transport);
        await collectTick(db, client);
        expect((await jobs(db))[0].status).toBe("running");
        expect(transport.mock.calls[0][0]).toContain("maxTotalChargeUsd=0.5");
        expect(transport.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer test-token" });
        await collectTick(db, client);
        expect((await posts(db))[0].account).toBe("builder");
        expect((await jobs(db))[0].status).toBe("succeeded");
        await collectTick(db, client);
        expect(transport).toHaveBeenCalledTimes(3);
    });
    it("retains a remote run after a read error without paying for a second run", async () => {
        const id = (await createSearch(db, search));
        (await enqueue(db, id));
        (await claimNext(db));
        (await attachRun(db, (await jobs(db))[0].id, "run1", "data1"));
        const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret error"));
        await collectTick(db, new ApifyClient("secret", transport));
        expect((await jobs(db))[0].status).toBe("running");
        expect((await jobs(db))[0].error).not.toContain("secret");
    });
    it("explains an empty provider result without creating a fake publication", async () => {
        const id = (await createSearch(db, { ...search, platform: "instagram" }));
        const job = (await enqueue(db, id));
        (await claimNext(db));
        (await attachRun(db, job, "run0", "data0"));
        (await completeJob(db, (await jobs(db))[0], "instagram", [{ error: "no_items" }]));
        expect((await posts(db))).toEqual([]);
        expect((await jobs(db))[0]).toMatchObject({ status: "succeeded", imported: 0 });
        expect((await jobs(db))[0].error).toContain("no_items");
    });
    it("does not retry ambiguous paid POST failures or expose provider payloads", async () => {
        const id = (await createSearch(db, search));
        (await enqueue(db, id));
        const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("secret-token"));
        await collectTick(db, new ApifyClient("secret-token", transport));
        expect((await jobs(db))[0].status).toBe("uncertain");
        await collectTick(db, new ApifyClient("secret-token", transport));
        expect(transport).toHaveBeenCalledTimes(1);
        expect((await jobs(db))[0].error).not.toContain("secret-token");
        const rejected = new ApifyClient("test", vi.fn<typeof fetch>().mockResolvedValue(new Response("private provider error", { status: 401 })));
        await expect(rejected.start(parseSearch(search))).rejects.toBeInstanceOf(ApifyError);
    });
});

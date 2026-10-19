import { assessAd } from "../../domain/ad-scoring";
import { randomUUID } from "node:crypto";
import type {Database as DatabaseSync} from './connection';
import { InputError } from "../../domain/analysis";
import { ACTORS, normalizePost, parseSearch, type SearchInput, type Platform } from "../../domain/social";
import { DAILY_BUDGET_USD, runBudget } from "../social/apify";
export type Search = SearchInput & {
    id: string;
    enabled: number;
    next_run_at: string;
};
export type Job = {
    id: string;
    search_id: string;
    status: string;
    actor: string;
    run_id: string | null;
    dataset_id: string | null;
    error: string | null;
    created_at: string;
    updated_at: string;
    imported: number;
    skipped: number;
    received: number;
    actual_usd: number | null;
    reserved_usd: number;
};
export type Post = {
    id: string;
    platform: Platform;
    url: string;
    text: string;
    account: string;
    published_at: string | null;
    first_seen_at: string;
    last_seen_at: string;
    archived: number;
    truncated: number;
    queries: string;
};
const now = () => new Date().toISOString();
async function transaction<T>(db: DatabaseSync, fn: () => T | Promise<T>): Promise<T> {
    (await db.exec("BEGIN IMMEDIATE"));
    try {
        const result = await fn();
        (await db.exec("COMMIT"));
        return result;
    }
    catch (error) {
        (await db.exec("ROLLBACK"));
        throw error;
    }
}
export async function searches(db: DatabaseSync): Promise<Search[]> {
    return (await db.prepare(`SELECT id, city, keywords, platform, result_limit AS resultLimit, interval_hours AS intervalHours, enabled, next_run_at FROM social_searches ORDER BY created_at DESC`).all()) as Search[];
}
export async function createSearch(db: DatabaseSync, data: Record<string, unknown>): Promise<string> {
    const s = parseSearch(data);
    const existing = (await db.prepare("SELECT id FROM social_searches WHERE city = ? AND keywords = ? AND platform = ?").get(s.city, s.keywords, s.platform));
    if (existing)
        return String(existing.id);
    const id = randomUUID();
    (await db.prepare("INSERT INTO social_searches (id, city, keywords, platform, result_limit, interval_hours, next_run_at, created_at) VALUES (?,?,?,?,?,?,?,?)").run(id, s.city, s.keywords, s.platform, s.resultLimit, s.intervalHours, now(), now()));
    return id;
}
export async function enableSearch(db: DatabaseSync, id: string, enabled: boolean) {
    const changed = (await db.prepare("UPDATE social_searches SET enabled = ? WHERE id = ?").run(Number(enabled), id));
    if (!changed.changes)
        throw new InputError("Поиск не найден.");
}
export async function enqueue(db: DatabaseSync, id: string): Promise<string> {
    return (await transaction(db, async () => {
        const s = (await searches(db)).find((s) => s.id === id);
        if (!s)
            throw new InputError("Поиск не найден.");
        const active = (await db.prepare("SELECT id FROM collection_jobs WHERE search_id = ? AND status IN ('queued','starting','running','uncertain')").get(id));
        if (active)
            return String(active.id);
        const jobId = randomUUID();
        (await db.prepare("INSERT INTO collection_jobs (id,search_id,status,actor,reserved_usd,created_at,updated_at) VALUES (?,?,'queued',?,?,?,?)").run(jobId, id, ACTORS[s.platform], runBudget(s.platform), now(), now()));
        (await db.prepare("UPDATE social_searches SET next_run_at = ? WHERE id = ?").run(new Date(Date.now() + s.intervalHours * 3600000).toISOString(), id));
        return jobId;
    }));
}
export async function jobs(db: DatabaseSync): Promise<Job[]> { return (await db.prepare("SELECT * FROM collection_jobs ORDER BY created_at DESC LIMIT 100").all()) as Job[]; }
export async function claimNext(db: DatabaseSync): Promise<Job | null> {
    return (await transaction(db, async () => {
        // A crashed POST may have created a paid remote run. Never retry it automatically.
        (await db.prepare("UPDATE collection_jobs SET status = 'uncertain', error = 'Запуск прерван. Сверьте Apify Console перед новым запуском.', updated_at = ? WHERE status = 'starting' AND updated_at < ?").run(now(), new Date(Date.now() - 60000).toISOString()));
        const job = (await db.prepare("SELECT * FROM collection_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get()) as Job | undefined;
        if (!job)
            return null;
        const reserved = Number((await db.prepare("SELECT COALESCE(SUM(reserved_usd),0) AS n FROM collection_jobs WHERE status != 'queued' AND updated_at >= ?").get(new Date(Date.now() - 86400000).toISOString()))?.n);
        if (reserved + job.reserved_usd > DAILY_BUDGET_USD + 0.00001) {
            (await db.prepare("UPDATE collection_jobs SET error = 'Достигнут бюджет запусков $1 за 24 часа. Ожидает освобождения лимита.' WHERE id = ?").run(job.id));
            return null;
        }
        (await db.prepare("UPDATE collection_jobs SET status='starting', error=NULL, updated_at=? WHERE id=?").run(now(), job.id));
        return { ...job, status: "starting" };
    }));
}
export async function attachRun(db: DatabaseSync, jobId: string, runId: string, datasetId: string) {
    (await db.prepare("UPDATE collection_jobs SET status='running',run_id=?,dataset_id=?,updated_at=? WHERE id=? AND status='starting'").run(runId, datasetId, now(), jobId));
}
export async function jobError(db: DatabaseSync, id: string, message: string, status?: "failed" | "uncertain") {
    if (status)
        (await db.prepare("UPDATE collection_jobs SET reserved_usd=CASE WHEN ?='failed' AND run_id IS NULL THEN 0 ELSE reserved_usd END,status=?,error=?,updated_at=? WHERE id=?").run(status, status, message, now(), id));
    else
        (await db.prepare("UPDATE collection_jobs SET error=? WHERE id=?").run(message, id));
}
export async function completeJob(db: DatabaseSync, job: Job, platform: Platform, rows: unknown[], actualUsd?: number, failure?: string) {
    (await transaction(db, async () => {
        const current = (await db.prepare("SELECT status FROM collection_jobs WHERE id=?").get(job.id));
        if (current?.status !== "running")
            return;
        let imported = 0, skipped = 0, empty = 0;
        for (const row of rows) {
            const post = normalizePost(platform, row);
            if (!post) {
                skipped++;
                if (row && typeof row === "object" && "error" in row && row.error === "no_items")
                    empty++;
                continue;
            }
            const existing = (await db.prepare("SELECT id FROM collected_posts WHERE platform=? AND external_id=?").get(platform, post.externalId));
            const postId = existing ? String(existing.id) : randomUUID();
            if (!existing) {
                (await db.prepare("INSERT INTO collected_posts (id,platform,external_id,url,text,account,published_at,truncated,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(postId, platform, post.externalId, post.url, post.text, post.account, post.publishedAt, Number(post.truncated), now(), now()));
                imported++;
            }
            else
                (await db.prepare("UPDATE collected_posts SET last_seen_at=? WHERE id=?").run(now(), postId));
            (await db.prepare("INSERT OR IGNORE INTO collection_matches VALUES (?,?)").run(postId, job.id));
        }
        (await db.prepare("UPDATE collection_jobs SET status=?,received=?,imported=?,skipped=?,actual_usd=?,error=?,updated_at=? WHERE id=?").run(failure ? "failed" : "succeeded", rows.length, imported, skipped, actualUsd ?? null, failure || (empty === rows.length && empty > 0 ? "Сервис не вернул доступных публичных публикаций по этой фразе (no_items). Попробуйте другой запрос." : skipped ? "Часть записей не является публикациями или не соответствует схеме сборщика." : null), now(), job.id));
    }));
}
export async function postFeed(db: DatabaseSync, platform = "", city = "", archived = false, page = 1, sort = "recent", category = "") {
    const rows = (await db.prepare(`SELECT p.*, (SELECT group_concat(q.label, ' · ') FROM (
    SELECT DISTINCT s.city || ': ' || s.keywords AS label FROM collection_matches m JOIN collection_jobs j ON j.id=m.job_id JOIN social_searches s ON s.id=j.search_id WHERE m.post_id=p.id
  ) q) AS queries FROM collected_posts p WHERE p.archived=? AND (?='' OR p.platform=?) AND (?='' OR EXISTS (
    SELECT 1 FROM collection_matches m JOIN collection_jobs j ON j.id=m.job_id JOIN social_searches s ON s.id=j.search_id WHERE m.post_id=p.id AND s.city=?
  )) ORDER BY p.first_seen_at DESC, p.id`).all(Number(archived), platform, platform, city, city)) as Post[];
    const assessed = rows.map(p => ({ post: p, assessment: assessAd(p.text, { publishedAt: p.published_at, truncated: !!p.truncated }) }));
    const counts = { candidate: 0, review: 0, housing: 0, other: 0, insufficient: 0 };
    for (const row of assessed)
        counts[row.assessment.category]++;
    const scored = assessed.filter(p => !category || (category === 'attention' ? ['candidate', 'review', 'insufficient'].includes(p.assessment.category) : p.assessment.category === category));
    if (sort === 'priority')
        scored.sort((a, b) => b.assessment.score - a.assessment.score || Number(['review', 'insufficient'].includes(b.assessment.category)) - Number(['review', 'insufficient'].includes(a.assessment.category)) || b.post.first_seen_at.localeCompare(a.post.first_seen_at) || a.post.id.localeCompare(b.post.id));
    return { posts: scored.slice((page - 1) * 30, (page - 1) * 30 + 31).map(p => p.post), counts, total: rows.length, matched: scored.length };
}
export async function posts(db: DatabaseSync, platform = "", city = "", archived = false, page = 1, sort = "recent", category = ""): Promise<Post[]> { return (await postFeed(db, platform, city, archived, page, sort, category)).posts; }
export async function archivePost(db: DatabaseSync, id: string, archived: boolean) { (await db.prepare("UPDATE collected_posts SET archived=? WHERE id=?").run(Number(archived), id)); }
export async function acknowledgeUncertain(db: DatabaseSync, id: string) {
    (await db.prepare("UPDATE collection_jobs SET status='failed',error='Аналитик сверил запуск в Apify Console.',updated_at=? WHERE id=? AND status='uncertain'").run(now(), id));
}
export async function heartbeat(db: DatabaseSync) { (await db.prepare("INSERT INTO collector_state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET heartbeat=excluded.heartbeat").run(now())); }
export async function workerActive(db: DatabaseSync): Promise<boolean> {
    const row = (await db.prepare("SELECT heartbeat FROM collector_state WHERE id=1").get());
    return !!row && Date.parse(String(row.heartbeat)) > Date.now() - (process.env.VERCEL ? 26*3600_000 : 120000);
}

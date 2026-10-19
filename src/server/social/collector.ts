import type {Database as DatabaseSync} from '../db/connection';
import { ApifyClient, ApifyError } from "./apify";
import { attachRun, claimNext, completeJob, enqueue, heartbeat, jobError, searches, type Job } from "../db/social";
export async function collectTick(db: DatabaseSync, client = new ApifyClient(), maxPolls = 100): Promise<void> {
    (await heartbeat(db));
    const saved = (await searches(db));
    for (const search of saved)
        if (search.enabled && search.next_run_at <= new Date().toISOString())
            (await enqueue(db, search.id));
    // GETs may be repeated safely; completed imports are atomic and idempotent.
    const running = (await db.prepare("SELECT * FROM collection_jobs WHERE status='running' ORDER BY updated_at LIMIT ?").all(maxPolls)) as Job[];
    for (const job of running) {
        try {
            const remote = await client.poll(job.run_id!);
            if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(remote.status)) {
                await db.prepare("UPDATE collection_jobs SET updated_at=? WHERE id=?").run(new Date().toISOString(),job.id);
                continue;
            }
            const search = saved.find((s) => s.id === job.search_id)!;
            const rows = await client.items(remote.defaultDatasetId, search.resultLimit);
            (await completeJob(db, job, search.platform, rows, remote.usageTotalUsd, remote.status === "SUCCEEDED" ? undefined : `Apify завершил запуск со статусом ${remote.status}. Сохранены доступные результаты.`));
        }
        catch (error) {
            (await jobError(db, job.id, error instanceof ApifyError ? error.message : "Ошибка чтения результатов Apify."));
        }
        (await heartbeat(db));
    }
    const job = (await claimNext(db));
    if (!job)
        return;
    try {
        const search = saved.find((s) => s.id === job.search_id)!;
        const remote = await client.start(search);
        (await attachRun(db, job.id, remote.id, remote.defaultDatasetId));
    }
    catch (error) {
        (await jobError(db, job.id, error instanceof ApifyError ? error.message : "Запуск не удалось сохранить. Сверьте Apify Console.", error instanceof ApifyError && !error.uncertain ? "failed" : "uncertain"));
    }
    (await heartbeat(db));
}

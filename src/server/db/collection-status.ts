import type {Database as DatabaseSync} from './connection';
import { DAILY_BUDGET_USD } from '../social/apify';
import { InputError } from '../../domain/analysis';
export const CANCELLED_MESSAGE = 'Отменено аналитиком до запуска. Расходов нет.';
export async function cancelQueuedJob(db: DatabaseSync, id: string) {
    const result = (await db.prepare("UPDATE collection_jobs SET status='failed', reserved_usd=0,error=?,updated_at=? WHERE id=? AND status='queued'").run(CANCELLED_MESSAGE, new Date().toISOString(), id));
    if (!result.changes)
        throw new InputError('Задание уже запущено или завершено. Обновите журнал.');
}
export async function collectionStatus(db: DatabaseSync, at = Date.now()) {
    const reservations = (await db.prepare("SELECT reserved_usd,updated_at FROM collection_jobs WHERE status!='queued' AND reserved_usd>0 AND updated_at>=? ORDER BY updated_at").all(new Date(at - 86400000).toISOString())) as {
        reserved_usd: number;
        updated_at: string;
    }[];
    const reserved = reservations.reduce((s, r) => s + r.reserved_usd, 0);
    const next = (await db.prepare("SELECT reserved_usd FROM collection_jobs WHERE status='queued' ORDER BY created_at LIMIT 1").get()) as {
        reserved_usd: number;
    } | undefined;
    let nextAt: number | null = next ? at : null, remaining = reserved;
    if (next && remaining + next.reserved_usd > DAILY_BUDGET_USD + 0.00001) {
        nextAt = null;
        for (const r of reservations) {
            remaining -= r.reserved_usd;
            if (remaining + next.reserved_usd <= DAILY_BUDGET_USD + 0.00001) {
                nextAt = Date.parse(r.updated_at) + 86400000;
                break;
            }
        }
    }
    const platforms = (await db.prepare(`SELECT s.platform,
 COUNT(CASE WHEN j.status='queued' THEN 1 END) queued,
 COUNT(CASE WHEN j.status IN ('starting','running') THEN 1 END) running,
 COUNT(CASE WHEN j.status='uncertain' THEN 1 END) uncertain,
 MAX(CASE WHEN j.status='succeeded' THEN j.updated_at END) last_success,
 (SELECT COUNT(*) FROM collected_posts p WHERE p.platform=s.platform) posts
 FROM social_searches s LEFT JOIN collection_jobs j ON j.search_id=s.id GROUP BY s.platform`).all()) as {
        platform: 'tiktok' | 'facebook' | 'instagram';
        queued: number;
        running: number;
        uncertain: number;
        last_success: string | null;
        posts: number;
    }[];
    return { limit: DAILY_BUDGET_USD, reserved, available: Math.max(0, DAILY_BUDGET_USD - reserved), nextAt: nextAt === null ? null : new Date(nextAt).toISOString(), waiting: !!next && reserved + next.reserved_usd > DAILY_BUDGET_USD + 0.00001, platforms };
}

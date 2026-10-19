import type {Database as DatabaseSync} from './connection';
const TTL = 5 * 60000;
export async function claimWorker(db: DatabaseSync, owner: string, now = Date.now()) {
    return (await db.prepare(`INSERT INTO worker_lease(id,owner,expires_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE worker_lease.expires_at<=?`).run(owner, now + TTL, now)).changes === 1;
}
export async function renewWorker(db: DatabaseSync, owner: string, now = Date.now()) {
    return (await db.prepare('UPDATE worker_lease SET expires_at=? WHERE id=1 AND owner=? AND expires_at>?').run(now + TTL, owner, now)).changes === 1;
}
export async function releaseWorker(db: DatabaseSync, owner: string) { (await db.prepare('DELETE FROM worker_lease WHERE id=1 AND owner=?').run(owner)); }

import { it, expect } from 'vitest';
import { openDatabase } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
import { claimWorker, renewWorker, releaseWorker } from '../src/server/db/worker-lease';
it('excludes a second worker and prevents stale owners renewing or deleting a new lease', async () => {
    const db = (await openDatabase(':memory:'));
    try {
        (await migrate(db));
        expect((await claimWorker(db, 'a', 0))).toBe(true);
        expect((await claimWorker(db, 'b', 1000))).toBe(false);
        expect((await renewWorker(db, 'a', 1000))).toBe(true);
        expect((await renewWorker(db, 'b', 2000))).toBe(false);
        expect((await claimWorker(db, 'b', 301000))).toBe(true);
        expect((await renewWorker(db, 'a', 301001))).toBe(false);
        (await releaseWorker(db, 'a'));
        expect((await claimWorker(db, 'c', 301002))).toBe(false);
        (await releaseWorker(db, 'b'));
        expect((await claimWorker(db, 'c', 301003))).toBe(true);
    }
    finally {
        db.close();
    }
});

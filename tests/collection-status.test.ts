import { it, expect } from 'vitest';
import { openDatabase } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
import { createSearch, enqueue, claimNext, jobs } from '../src/server/db/social';
import { collectionStatus, cancelQueuedJob } from '../src/server/db/collection-status';
const search = { city: 'Усть-Каменогорск', keywords: 'новостройки', platform: 'tiktok', resultLimit: '5', intervalHours: '24' };
it('shows rolling reservation release and platform totals', async () => { const db = (await openDatabase(':memory:')); try {
    (await migrate(db));
    const a = (await createSearch(db, search));
    (await enqueue(db, a));
    (await claimNext(db));
    const now = Date.now();
    (await db.prepare("UPDATE collection_jobs SET status='succeeded',reserved_usd=1,updated_at=?").run(new Date(now - 3600000).toISOString()));
    const b = (await createSearch(db, { ...search, keywords: 'квартиры' }));
    (await enqueue(db, b));
    const state = (await collectionStatus(db, now));
    expect(state).toMatchObject({ reserved: 1, available: 0, waiting: true, nextAt: new Date(now + 23 * 3600000).toISOString() });
    expect(state.platforms[0]).toMatchObject({ queued: 1, posts: 0 });
    expect((await collectionStatus(db, now + 24 * 3600000))).toMatchObject({ reserved: 0, waiting: false });
}
finally {
    db.close();
} });
it('cancels only queued jobs, retains history, and refuses racing cancellations', async () => { const db = (await openDatabase(':memory:')); try {
    (await migrate(db));
    const s = (await createSearch(db, search));
    const id = (await enqueue(db, s));
    (await cancelQueuedJob(db, id));
    expect((await jobs(db))[0]).toMatchObject({ status: 'failed', reserved_usd: 0 });
    expect((await collectionStatus(db)).platforms[0].queued).toBe(0);
    const next = (await enqueue(db, s));
    expect(next).not.toBe(id);
    (await claimNext(db));
    (await expect(async () => (await cancelQueuedJob(db, next))).rejects.toThrow('уже запущено'));
    expect((await jobs(db)).find(j => j.id === next)?.status).toBe('starting');
}
finally {
    db.close();
} });

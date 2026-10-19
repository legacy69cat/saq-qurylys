import { it, expect, vi } from 'vitest';
import { openDatabase } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
import { extractAddresses } from '../src/domain/addresses';
import { parsePhoton, searchLocation } from '../src/server/geocoding/photon';
import { createProjectFromPost } from '../src/server/db/location-projects';
import { listProjects } from '../src/server/db/projects';
async function setup() { const db = (await openDatabase(':memory:')); (await migrate(db)); (await db.prepare("INSERT INTO collected_posts VALUES ('post','tiktok','1','https://www.tiktok.com/@x/video/1','ЖК строится. Продажа квартир на ул. Бурова 27/1, Усть-Каменогорск.','x','2026-01-01',0,'2026-01-02','2026-01-02',0)").run()); return db; }
const feature = { geometry: { type: 'Point', coordinates: [82.61, 49.93] }, properties: { countrycode: 'KZ', city: 'Өскемен', street: 'Бурова', housenumber: '27/1', osm_type: 'W', osm_id: 123 } };
const form = { postId: 'post', name: 'ЖК из объявления', city: 'Усть-Каменогорск', address: 'ул. Бурова 27/1', latitude: '49.93', longitude: '82.61', geoSource: 'https://www.openstreetmap.org/way/123', stage: 'construction', confirmAddress: 'on', confirmStage: 'on', actor: 'Проверяющий' };
it.each([['Ул. Бурова 27/1, Усть-Каменогорск', 'Ул. Бурова 27/1'], ['квартира на ул. Михаэлиса 19, 4 этаж', 'ул. Михаэлиса 19'], ['Абай көшесі 10', 'Абай көшесі 10']])('extracts a literal address: %s', (text, address) => expect(extractAddresses(text)).toContain(address));
it('does not invent an address from phone, price, or city alone', () => expect(extractAddresses('Усть-Каменогорск. 18 000 000 ₸. +7 777 111 22 33')).toEqual([]));
it('rejects malformed, foreign, and invalid coordinates; flags street centroids', () => { expect(parsePhoton({ features: [feature] })).toHaveLength(1); expect(parsePhoton({ features: [{ ...feature, properties: { ...feature.properties, countrycode: 'DE' } }, { ...feature, geometry: { type: 'Point', coordinates: [181, 49] } }] })).toEqual([]); expect(parsePhoton({ features: [{ ...feature, properties: { ...feature.properties, housenumber: undefined } }] })[0].precise).toBe(false); });
it('caches identical lookups and does not send the publication text', async () => { const db = (await setup()); try {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ features: [feature] })));
    const id = await searchLocation(db, 'post', 'ул. Бурова 27/1', 'Усть-Каменогорск', transport);
    await searchLocation(db, 'post', 'ул. Бурова 27/1', 'Усть-Каменогорск', transport);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(String(transport.mock.calls[0][0])).not.toContain('tiktok');
    const saved = (await db.prepare('SELECT results FROM location_searches WHERE id=?').get(id))!;
    expect(JSON.parse(String(saved.results))[0].precise).toBe(true);
    await expect((searchLocation(db, 'post', 'ул. Бурова 28', 'Усть-Каменогорск', transport))).rejects.toThrow('две секунды');
}
finally {
    db.close();
} });
it('wrong house or city never yields a confirmable point', async () => { const db = (await setup()); try {
    const id = await searchLocation(db, 'post', 'ул. Бурова 28', 'Усть-Каменогорск', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ features: [feature] }))));
    expect(JSON.parse(String((await db.prepare('SELECT results FROM location_searches WHERE id=?').get(id))!.results))[0].precise).toBe(false);
}
finally {
    db.close();
} });
it('creates and links atomically with sources, zero unconfirmed score, and idempotency', async () => { const db = (await setup()); try {
    const id = (await createProjectFromPost(db, form));
    const p = (await listProjects(db))[0];
    expect(p).toMatchObject({ id, latitude: 49.93, longitude: 82.61, isDemo: false, developer: 'Не установлен', risk: { score: 0, needsReview: true } });
    expect(p.publications).toHaveLength(1);
    expect(p.evidence.some(e => e.source === 'Источник координат')).toBe(true);
    expect((await createProjectFromPost(db, form))).toBe(id);
    expect((await listProjects(db))).toHaveLength(1);
}
finally {
    db.close();
} });
it('refuses missing confirmation and prevents a second object at the same point', async () => { const db = (await setup()); try {
    (await expect(async () => (await createProjectFromPost(db, { ...form, confirmAddress: '' }))).rejects.toThrow('Подтвердите'));
    expect((await listProjects(db))).toHaveLength(0);
    (await createProjectFromPost(db, form));
    (await db.exec("INSERT INTO collected_posts SELECT 'post2',platform,'2',url,text,account,published_at,truncated,first_seen_at,last_seen_at,archived FROM collected_posts WHERE id='post'"));
    (await expect(async () => (await createProjectFromPost(db, { ...form, postId: 'post2' }))).rejects.toThrow('уже есть объект'));
    expect((await listProjects(db))).toHaveLength(1);
    expect((await db.prepare('SELECT count(*) n FROM collected_links').get())?.n).toBe(1);
}
finally {
    db.close();
} });
it('rolls back all records if linking fails', async () => { const db = (await setup()); try {
    (await db.exec("CREATE TRIGGER reject_link BEFORE INSERT ON collected_links BEGIN SELECT RAISE(ABORT,'test failure'); END;"));
    (await expect(async () => (await createProjectFromPost(db, form))).rejects.toThrow('test failure'));
    expect((await listProjects(db))).toHaveLength(0);
    expect((await db.prepare('SELECT count(*) n FROM evidence').get())?.n).toBe(0);
}
finally {
    db.close();
} });

import { describe, it, expect } from 'vitest';
import { SEARCH_PACKS, searchQueries, paymentMentions } from '../src/domain/search-packs';
import { actorInput, parseSearch } from '../src/domain/social';
import { openDatabase } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
import { installSearchPacks } from '../src/server/db/search-packs';
import { searches } from '../src/server/db/social';
describe('search packs', () => {
    it('shows literal payment mentions without deciding a risk factor', () => { expect(paymentMentions('Без депозита. Бронь бесплатная.')).toEqual(['депозита', 'Бронь']); expect(paymentMentions('Открыт парк')).toEqual([]); });
    it('contains 48 unique phrases and rotates city spellings', () => {
        const terms = SEARCH_PACKS.flatMap(p => [...p.terms]);
        expect(terms).toHaveLength(48);
        expect(new Set(terms).size).toBe(48);
        expect(searchQueries('Усть-Каменогорск', 'новостройки | пәтер | бронь')).toEqual(['новостройки Усть-Каменогорск', 'пәтер Өскемен', 'бронь Усть Каменогорск']);
        expect(searchQueries('Алматы', 'бронь | пәтер')).toEqual(['бронь Алматы', 'пәтер Алматы']);
    });
    it('uses bounded platform-specific batches and rejects unlimited/ambiguous inputs', () => {
        const base = { city: 'Усть-Каменогорск', keywords: SEARCH_PACKS[0].terms.join(' | '), resultLimit: 40, intervalHours: 168 };
        expect(actorInput(parseSearch({ ...base, platform: 'facebook' }))).toMatchObject({ maxResults: 5 });
        const t = actorInput(parseSearch({ ...base, platform: 'tiktok' }));
        expect(t.searchQueries).toHaveLength(8);
        expect(t.resultsPerPage).toBe(5);
        const i = actorInput(parseSearch({ ...base, platform: 'instagram' }));
        expect(i.search?.split(',')).toHaveLength(8);
        expect(i.search).not.toContain('-');
        for (const keywords of ['a | a', Array(9).fill('a').join(' | '), 'x,y'])
            expect(() => parseSearch({ ...base, platform: 'tiktok', keywords })).toThrow();
        expect(() => parseSearch({ ...base, platform: 'tiktok', resultLimit: 1 })).toThrow();
    });
    it('installs 18 searches atomically and idempotently without enqueuing paid jobs', async () => {
        const db = (await openDatabase(':memory:'));
        try {
            (await migrate(db));
            const ids = SEARCH_PACKS.map(p => p.id);
            expect((await installSearchPacks(db, 'Усть-Каменогорск', ids, true))).toBe(18);
            (await installSearchPacks(db, 'Усть-Каменогорск', ids, true));
            expect((await searches(db))).toHaveLength(18);
            expect((await searches(db)).every(s => s.enabled && s.resultLimit === 40)).toBe(true);
            expect((await db.prepare('SELECT count(*) AS n FROM collection_jobs').get())?.n).toBe(0);
            (await expect(async () => (await installSearchPacks(db, 'Алматы', ['missing'], true))).rejects.toThrow());
            expect((await searches(db))).toHaveLength(18);
        }
        finally {
            db.close();
        }
    });
});

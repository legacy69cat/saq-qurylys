import { expect, it } from 'vitest';
import { assessAd } from '../src/domain/ad-scoring';
it('uses case weights with exact source quotes once per factor', () => {
    const text = 'ЖК Арман строится. Продажа квартир. Внесите депозит 300 000 ₸ за квартиру. Внесите депозит 300 000 ₸ за квартиру.';
    const a = assessAd(text);
    expect(a.score).toBe(35);
    expect(a.signals.map(s => s.code)).toEqual(['R2', 'R3']);
    for (const s of a.signals)
        expect(text.includes(s.quote)).toBe(true);
});
it.each(['Квартиры в строящемся доме. Продажа без первоначального взноса.', 'Квартиры в строящемся доме. Не вносите депозит 300 000 ₸.', 'Квартиры в строящемся доме. Депозит 0 ₸.', 'Квартиры: бесплатная бронь. Оплатите депозит не нужно.'])('does not infer R2 from negated or free terms: %s', text => { expect(assessAd(text).signals.some(s => s.code === 'R2')).toBe(false); });
it.each(['Аренда квартиры: внесите депозит 300 000 ₸.', 'Новости: мошенники предлагают квартиры. Внесите депозит 300 000 ₸.', 'Продаётся квартира. Дом сдан. Внесите депозит 300 000 ₸.', 'Квартиры и ипотека, звоните. #новостройки', 'Мой любимый город #новостройки #квартиры'])('does not treat noise as construction risk: %s', text => expect(assessAd(text).score).toBe(0));
it('does not derive legal absence from an advertisement', () => { const a = assessAd('Продажа квартир в строящемся доме. Разрешения нет.'); expect(a.signals.map(s => s.code)).toEqual(['R3']); expect(a.score).toBe(10); });
it('supports Kazakh offers', () => { const a = assessAd('Салынып жатқан үй. Пәтер сатылады. Алғашқы жарна 20%.'); expect(a.score).toBe(35); });
it('retains data-quality warnings without inventing risk', () => { const a = assessAd('', { publishedAt: '2020-01-01', truncated: true, now: Date.parse('2026-01-01') }); expect(a.category).toBe('insufficient'); expect(a.score).toBe(0); expect(a.warnings).toHaveLength(2); });
it('a deposit amount of 300000 is not interpreted as zero', () => expect(assessAd('Продаём квартиры в строящемся доме. Депозит 300 000 ₸.').score).toBe(35));
it('ranking happens before pagination and category filtering', async () => {
    const { openDatabase } = await import('../src/server/db/connection');
    const { migrate } = await import('../src/server/db/migrations');
    const { posts, postFeed } = await import('../src/server/db/social');
    const db = await openDatabase(':memory:');
    try {
        await migrate(db);
        const insert = db.prepare("INSERT INTO collected_posts VALUES (?,'tiktok',?,'https://www.tiktok.com/@fixture/video/123',?,'fixture','2026-01-01',0,?,'2026-01-01',0)");
        for (let i = 0; i < 35; i++)
            (await insert.run(`n${i}`, `n${i}`, 'Новости города и дорог', '2026-02-01'));
        (await insert.run('priority', 'priority', 'Продажа квартир в строящемся доме. Внесите депозит 300 000 ₸.', '2026-01-01'));
        expect(await postFeed(db, '', '', false, 1, 'priority', 'candidate')).toMatchObject({ total: 36, matched: 1, counts: { candidate: 1, other: 35 } });
        expect((await posts(db, '', '', false, 1, 'priority'))[0].id).toBe('priority');
        expect(await posts(db, '', '', false, 1, 'priority', 'candidate')).toHaveLength(1);
        expect((await posts(db, '', '', false, 2, 'priority')).some(p => p.id === 'priority')).toBe(false);
    }
    finally {
        db.close();
    }
});
it.each(['Квартиры от застройщика. Бронь 100 000 ₸.', 'Квартиры в продаже. Первый взнос 20%.', 'Пәтер сатылады. Алғашқы жарна 10%.'])('recognizes additional explicit payment terms: %s', text => expect(assessAd(text).signals.some(s => s.code === 'R2')).toBe(true));
it.each(['Квартиры от застройщика. Рассрочка без банка.', 'Квартиры. Предварительный договор, бронь в директ.', 'Продажа квартир. Без первоначального взноса.', 'Квартиры в продаже. Не попадитесь мошенникам! Внесите депозит 300 000 ₸.'])('retains ambiguous ads for review without fabricated score: %s', text => expect(assessAd(text)).toMatchObject({ score: 0, category: 'review' }));
it('handles short substantive payment ads', () => expect(assessAd('Квартиры. Внесите задаток.').score).toBe(25));

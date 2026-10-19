import { test, expect } from './fixtures';
import { openDatabase } from '../../src/server/db/connection';
import { searchLocation } from '../../src/server/geocoding/photon';
test('extracted address → cached geocoding → reviewed point → linked project on map', async ({ page }) => {
    const db = (await openDatabase(process.env.SAQ_E2E_DB!));
    try {
        (await db.prepare("INSERT INTO collected_posts VALUES('geo-post','tiktok','geo1','https://www.tiktok.com/@fixture/video/123','ЖК Новый строится. Продажа квартир: ул. Бурова 27/1, Усть-Каменогорск.','fixture','2026-01-01',0,'2026-01-02','2026-01-02',0)").run());
        await searchLocation(db, 'geo-post', 'ул. Бурова 27/1', 'Усть-Каменогорск', async () => new Response(JSON.stringify({ features: [{ geometry: { type: 'Point', coordinates: [82.61, 49.93] }, properties: { countrycode: 'KZ', city: 'Өскемен', street: 'Бурова', housenumber: '27/1', osm_type: 'W', osm_id: 123 } }] })));
    }
    finally {
        db.close();
    }
    await page.goto('/monitoring');
    await expect(page.locator('.address-extraction')).toContainText('ул. Бурова 27/1');
    await page.getByRole('link', { name: 'Проверить адрес и добавить на карту →', exact: true }).click();
    const lookup = page.getByRole('form', { name: 'Найти координаты', exact: true });
    await expect(lookup.getByLabel('Город', { exact: true })).toHaveValue('Усть-Каменогорск');
    await expect(lookup.getByLabel('Улица и номер дома', { exact: true })).toHaveValue('ул. Бурова 27/1');
    await lookup.getByRole('button').click();
    await expect(page).toHaveURL(/search=/);
    await expect(page.locator('.project-marker')).toHaveCount(1);
    const create = page.getByRole('form', { name: 'Создать объект из объявления', exact: true });
    await create.getByRole('radio').check();
    await create.getByLabel('Название ЖК или объекта').fill('Объект из геокодирования');
    await create.getByRole('combobox', { name: 'Проверенная стадия', exact: true }).selectOption('construction');
    await create.getByLabel('Адрес, точка и связь объявления с объектом проверены').check();
    await create.getByLabel('Стадия проверена; объявление не относится к другому дому').check();
    await create.getByLabel('Автор решения').fill('Проверяющий');
    await create.getByRole('button').click();
    await expect(page).toHaveURL(/projects\/ad-geo-post$/);
    await expect(page.locator('.detail-score')).toContainText('0');
    await expect(page.locator('.publication-card')).toContainText('ул. Бурова 27/1');
    await expect(page.locator('.evidence-list')).toContainText('Источник координат');
    await page.goto('/?q=' + encodeURIComponent('Объект из геокодирования'));
    await expect(page.locator('.project-marker')).toHaveCount(1);
    await page.goto('/monitoring/geo-post/location');
    await expect(page.locator('main')).toContainText('Объявление уже привязано');
    await expect(page.getByRole('button', { name: 'Найти координаты', exact: true })).toHaveCount(0);
});

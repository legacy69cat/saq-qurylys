import { test, expect } from "./fixtures";
import { openDatabase } from "../../src/server/db/connection";
import { createSearch, enqueue, attachRun, claimNext, completeJob, jobs, searches } from "../../src/server/db/social";
test("save search → queue → imported fixture → feed → archive", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto("/monitoring");
    await expect(page.getByRole("heading", { name: "Мониторинг соцсетей" })).toBeVisible();
    await expect(page.getByText("Ключ Apify не настроен", { exact: true })).toBeVisible();
    await page.getByText("Добавить поиск", { exact: true }).click();
    const form = page.getByRole("form", { name: "Сохранить поиск", exact: true });
    await form.getByLabel("Город", { exact: true }).fill("Усть-Каменогорск");
    await form.getByRole("combobox", { name: "Площадка", exact: true }).selectOption("tiktok");
    await form.getByRole("button").click();
    const card = page.getByRole("region", { name: "Сохранённые поиски" }).locator(".collection-searches article").first();
    await expect(card).toContainText("Расписание на паузе");
    await card.getByRole("button", { name: "Собрать сейчас", exact: true }).click();
    await expect(page.getByRole("heading").filter({ hasText: "— В очереди" })).toBeVisible();
    const db = (await openDatabase(process.env.SAQ_E2E_DB!));
    try {
        expect((await searches(db))).toHaveLength(1);
        const job = (await claimNext(db))!;
        (await attachRun(db, job.id, "testRun", "testData"));
        (await completeJob(db, (await jobs(db))[0], "tiktok", [{ webVideoUrl: "https://www.tiktok.com/@test/video/123", text: "Тестовый образец для браузерной проверки. Новостройки.", authorMeta: { name: "fixture" }, createTimeISO: "2025-01-01T00:00:00Z" }]));
    }
    finally {
        db.close();
    }
    await page.getByRole("button", { name: "Обновить ленту", exact: true }).click();
    const post = page.locator(".collected-post");
    await expect(post).toContainText("Тестовый образец");
    await expect(post).toContainText("Требует проверки");
    await expect(post.getByRole("link", { name: "Открыть оригинал ↗" })).toHaveAttribute("href", "https://www.tiktok.com/@test/video/123");
    await page.screenshot({ path: testInfo.outputPath("monitoring.png"), fullPage: true });
    await post.getByRole("button", { name: "Убрать в архив" }).click();
    await expect(page.locator(".collected-post")).toHaveCount(0);
    await page.getByRole("combobox", { name: "Показать", exact: true }).selectOption("1");
    await page.getByRole("button", { name: "Применить" }).click();
    await expect(page.locator(".collected-post")).toHaveCount(1);
    await expect(page.locator(".collected-post")).toContainText("Вернуть во входящие");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(errors).toEqual([]);
});
test("search packs and analyst scenario", async ({ page }) => {
    await page.goto('/monitoring');
    await page.getByText('Выбрать наборы для сбора', { exact: true }).click();
    const form = page.getByRole('form', { name: 'Добавить выбранные наборы', exact: true });
    await expect(form.locator('input[name=packs]:checked')).toHaveCount(6);
    await form.getByRole('button').click();
    await expect(page.getByText('Управление поисками (18) · активно 0', { exact: true })).toBeVisible();
    await form.getByRole('button').click();
    await expect(form.getByRole('button', { name: 'Добавить выбранные наборы', exact: true })).toBeEnabled();
    await expect(form.getByRole('status')).toContainText('Сохранено');
    await expect(page.getByText('Управление поисками (18) · активно 0', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Как работать', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Сценарий аналитика ДЭР', exact: true })).toBeVisible();
    await expect(page.locator('.scenario-steps > li')).toHaveCount(7);
    await expect(page.locator('main')).toContainText('R1 — 35');
    await expect(page.locator('main')).not.toContainText('Контур 07');
});
test('queued job can be cancelled without starting a paid run', async ({ page }) => {
    const db = (await openDatabase(process.env.SAQ_E2E_DB!));
    try {
        const id = (await createSearch(db, { city: 'Усть-Каменогорск', keywords: 'новостройки', platform: 'tiktok', resultLimit: '5', intervalHours: '24' }));
        (await enqueue(db, id));
    }
    finally {
        db.close();
    }
    await page.goto('/monitoring');
    await expect(page.getByRole('region', { name: 'Состояние сбора' })).toContainText('В очереди: 1');
    await page.getByRole('button', { name: 'Отменить задание', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Состояние сбора' })).toContainText('Очередь пуста');
    await expect(page.getByRole('heading', { name: /— Отменён$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Отменить задание', exact: true })).toHaveCount(0);
});
test('review queue retains ambiguous and textless ads without invented points', async ({ page }) => {
    const db = (await openDatabase(process.env.SAQ_E2E_DB!));
    try {
        const insert = db.prepare("INSERT INTO collected_posts VALUES (?,'tiktok',?,'https://www.tiktok.com/@fixture/video/123',?,'fixture','2026-01-01',0,'2026-01-02','2026-01-02',0)");
        (await insert.run('clear', 'clear', 'Продажа квартир в строящемся доме. Бронь 100 000 ₸.'));
        (await insert.run('ambiguous', 'ambiguous', 'Квартиры от застройщика. Рассрочка без банка.'));
        (await insert.run('empty', 'empty', '#новостройки'));
        (await insert.run('noise', 'noise', 'Новости города и ремонта автомобильных дорог.'));
    }
    finally {
        db.close();
    }
    await page.goto('/monitoring');
    await page.getByRole('link', { name: 'Открыть очередь проверки →', exact: true }).click();
    await expect(page.locator('.collected-post')).toHaveCount(3);
    await expect(page.locator('.collected-post').first()).toContainText('35 / 35');
    await expect(page.locator('.collected-post').filter({ hasText: 'Рассрочка без банка' })).toContainText('0 / 35');
    await expect(page.locator('.collected-post').filter({ hasText: '#новостройки' })).toContainText('Нет оценки');
    await page.getByRole('combobox', { name: 'Оценка', exact: true }).selectOption('candidate');
    await page.getByRole('button', { name: 'Применить', exact: true }).click();
    await expect(page.locator('.collected-post')).toHaveCount(1);
});

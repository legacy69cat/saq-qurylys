import { expect, test } from "./fixtures";
test("database → API → registry → risk explanation → evidence", async ({ page, request }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error")
        errors.push(message.text()); });
    const health = await request.get("/api/health");
    expect(await health.json()).toEqual({ status: "ok", projects: 8, publications: 12 });
    const response = await request.get("/api/projects");
    expect(response.status()).toBe(200);
    const { projects } = await response.json();
    expect(projects.find((project: {
        id: string;
    }) => project.id === "demo-b").risk).toMatchObject({ score: 70, zone: "red" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Обзор строительства" })).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("registry.png"), fullPage: true });
    await page.getByRole("link", { name: "Контур 02", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Контур 02", exact: true })).toBeVisible();
    await expect(page.locator(".detail-score")).toContainText("70");
    await expect(page.locator(".detail-score")).toContainText("Красная");
    await page.locator(".factor-row").filter({ hasText: "Прямое предложение внести деньги" }).getByRole("link", { name: "Источник 1" }).click();
    await expect(page).toHaveURL(/#evidence-demo-b-ad-1$/);
    await expect(page.locator("#evidence-demo-b-ad-1")).toContainText("депозит 500 000");
    await page.screenshot({ path: testInfo.outputPath("project.png"), fullPage: true });
    expect(errors).toEqual([]);
});
test("filters, no results, reset, and unknown project", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Зона риска").selectOption("red");
    await page.getByRole("button", { name: "Найти", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(2);
    await page.getByLabel("Поиск ЖК или застройщика").fill("Контур 02");
    await page.getByRole("button", { name: "Найти", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await page.getByLabel("Поиск ЖК или застройщика").fill("Несуществующий объект");
    await page.getByRole("button", { name: "Найти", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Объекты не найдены" })).toBeVisible();
    await page.getByRole("link", { name: "Сбросить", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(8);
    await page.goto("/projects/does-not-exist");
    await expect(page.getByRole("heading", { name: "Объект не найден" })).toBeVisible();
});

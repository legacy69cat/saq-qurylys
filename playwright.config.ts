import { defineConfig, devices } from "@playwright/test";

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.SAQ_E2E_DB ||= join(mkdtempSync(join(tmpdir(), "saq-e2e-")), "test.sqlite");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalTeardown: "./tests/e2e/cleanup.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { channel: process.env.PLAYWRIGHT_CHANNEL, baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" } },
  ],
  webServer: {
    command: "npm run db:setup && npm run start -- --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    env: { TURSO_DATABASE_URL:"", TURSO_AUTH_TOKEN:"", VERCEL:"", VERCEL_OIDC_TOKEN:"", DRONE_AI_MODEL:"", TELEGRAM_BOT_TOKEN:"", TELEGRAM_WEBHOOK_SECRET:"", APP_URL:"http://127.0.0.1:3100", SAQ_AUTH_MODE:"local", APP_ENV:"local", DATABASE_PATH: process.env.SAQ_E2E_DB, AI_GATEWAY_API_KEY: "", AI_GATEWAY_MODEL: "", APIFY_TOKEN: "", SAQ_DEMO_MODE: "1" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

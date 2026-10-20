if(process.env.TURSO_DATABASE_URL)throw new Error('Tests must never use a remote database');
import { test as base, expect } from "@playwright/test";
import { openDatabase } from "../../src/server/db/connection";
import { migrate } from "../../src/server/db/migrations";
import { seedDemo } from "../../src/server/db/seed";
export const test = base.extend<{
    isolatedData: void;
}>({
    page: async ({ page }, use) => {
        await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') }));
        await use(page);
    },
    isolatedData: [async ({ baseURL }, use) => {
            if (!baseURL)
                throw new Error("Local test server URL is required");
            const path = process.env.SAQ_E2E_DB;
            if (!path || !path.includes("saq-e2e-"))
                throw new Error("Dedicated E2E database is required");
            const db = (await openDatabase(path, { create: true }));
            try {
                (await migrate(db));
                (await db.exec(`BEGIN IMMEDIATE;
        DELETE FROM telegram_inbox; DELETE FROM location_searches; DELETE FROM geocode_cache; DELETE FROM geocoder_state; DELETE FROM collected_links; DELETE FROM project_sources; DELETE FROM collection_matches; DELETE FROM collected_posts; DELETE FROM collection_jobs; DELETE FROM social_searches; DELETE FROM collector_state; DELETE FROM audit_events; DELETE FROM signals; DELETE FROM suggestions; DELETE FROM analysis_runs;
        DELETE FROM factor_evidence; DELETE FROM factors; DELETE FROM progress_observations;
        DELETE FROM publications; DELETE FROM legal_checks; DELETE FROM evidence; DELETE FROM projects;
        DELETE FROM developers; DELETE FROM reviewers; COMMIT;`));
                (await seedDemo(db));
            }
            finally {
                db.close();
            }
            await use();
        }, { auto: true }],
});
export { expect };

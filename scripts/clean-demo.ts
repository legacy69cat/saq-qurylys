import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { databasePath, openDatabase } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
const db = (await openDatabase(databasePath()));
try {
    mkdirSync('data/backups', { recursive: true });
    const backup = resolve(`data/backups/before-demo-removal-${Date.now()}.sqlite`);
    (await db.prepare('VACUUM INTO ?').run(backup));
    (await migrate(db));
    (await db.exec('BEGIN IMMEDIATE'));
    try {
        const demo = "SELECT id FROM projects WHERE is_demo=1";
        (await db.exec(`DELETE FROM collected_links WHERE publication_id IN (SELECT id FROM publications WHERE project_id IN (${demo}));
 DELETE FROM suggestions WHERE publication_id IN (SELECT id FROM publications WHERE project_id IN (${demo}));
 DELETE FROM analysis_runs WHERE publication_id IN (SELECT id FROM publications WHERE project_id IN (${demo}));`));
        for (const table of ['audit_events', 'signals', 'factor_evidence', 'factors', 'progress_observations', 'publications', 'legal_checks', 'project_sources', 'evidence'])
            (await db.exec(`DELETE FROM ${table} WHERE project_id IN (${demo})`));
        (await db.exec(`DELETE FROM projects WHERE is_demo=1;
 DELETE FROM developers WHERE is_demo=1 AND id NOT IN (SELECT developer_id FROM projects);
 DELETE FROM reviewers WHERE is_demo=1 AND id NOT IN (SELECT reviewed_by FROM factors WHERE reviewed_by IS NOT NULL) AND id NOT IN (SELECT reviewed_by FROM legal_checks WHERE reviewed_by IS NOT NULL);`));
        (await db.exec('COMMIT'));
        console.log('Demo records removed. Backup:', backup);
    }
    catch (e) {
        (await db.exec('ROLLBACK'));
        throw e;
    }
}
finally {
    db.close();
}

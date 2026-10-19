import { describe, it, expect } from 'vitest';
import { openDatabase } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
import { addProject, linkCollectedPost, saveDocumentFactor } from '../src/server/db/registry';
import { listProjects } from '../src/server/db/projects';
async function setup() { const db = (await openDatabase(':memory:')); (await migrate(db)); (await addProject(db, { requestId: 'real', name: 'Объект', address: 'Адрес', developer: 'Застройщик', stage: 'construction', latitude: 49.9, longitude: 82.6, source: 'Каталог', sourceUrl: 'https://example.org/project', actor: 'Аналитик' })); return db; }
const factor = { projectId: 'real', actor: 'Проверяющий', source: 'Документ', url: 'https://example.org/document', text: 'Проверенные сведения', observedAt: '2026-01-01', verified: 'on', decision: 'confirmed' };
describe('real registry', () => {
    it('stores sourced coordinates without invented BIN or risk', async () => { const db = (await setup()); try {
        const p = (await listProjects(db))[0];
        expect(p).toMatchObject({ isDemo: false, latitude: 49.9, longitude: 82.6, bin: 'Не установлен', risk: { score: 0, needsReview: true }, legalBasis: { status: 'unknown' } });
        expect(p.source?.url).toBe('https://example.org/project');
    }
    finally {
        db.close();
    } });
    it('validates both coordinates', async () => { const db = (await setup()); try {
        (await expect(async () => (await addProject(db, { name: 'x', address: 'x', developer: 'x', latitude: 49 }))).rejects.toThrow('координаты'));
    }
    finally {
        db.close();
    } });
    it('links original captured text without scoring and rejects duplicate', async () => { const db = (await setup()); try {
        (await db.prepare("INSERT INTO collected_posts VALUES ('post','tiktok','123','https://www.tiktok.com/@x/video/123','Внесите депозит','x','2026-01-01',0,'2026-01-02','2026-01-03',0)").run());
        const input = { postId: 'post', projectId: 'real', actor: 'Аналитик', confirmLink: 'on' };
        (await expect(async () => (await linkCollectedPost(db, { ...input, confirmLink: '' }))).rejects.toThrow('совпадение'));
        (await linkCollectedPost(db, input));
        const p = (await listProjects(db))[0];
        expect(p.publications).toHaveLength(1);
        expect(p.risk.score).toBe(0);
        expect(p.evidence.find(e => e.id === 'collected-post')?.capturedAt).toBe('2026-01-02');
        (await expect(async () => (await linkCollectedPost(db, input))).rejects.toThrow('уже привязана'));
    }
    finally {
        db.close();
    } });
    it('confirms and revokes documentary factors, compares both readiness sources', async () => {
        const db = (await setup());
        try {
            (await saveDocumentFactor(db, { ...factor, code: 'R4', requestId: 'complaint' }));
            expect((await listProjects(db))[0].risk.score).toBe(15);
            const r5 = { ...factor, code: 'R5', requestId: 'progress', claimed: 80, actual: 60, actualSource: 'Акт осмотра', actualUrl: 'https://example.org/inspection', actualDate: '2026-01-01' };
            (await expect(async () => (await saveDocumentFactor(db, { ...r5, actual: 61 }))).rejects.toThrow('20 п.п.'));
            expect((await listProjects(db))[0].risk.score).toBe(15);
            (await saveDocumentFactor(db, r5));
            expect((await listProjects(db))[0].risk.score).toBe(25);
            expect((await listProjects(db))[0].progress).toHaveLength(2);
            (await saveDocumentFactor(db, { ...factor, code: 'R6', requestId: 'delay' }));
            expect((await listProjects(db))[0].risk.score).toBe(30);
            (await saveDocumentFactor(db, { ...factor, code: 'R4', decision: 'rejected', requestId: 'revoke' }));
            expect((await listProjects(db))[0].risk.score).toBe(15);
            expect((await db.prepare('SELECT count(*) n FROM audit_events').get())?.n).toBe(5);
        }
        finally {
            db.close();
        }
    });
});

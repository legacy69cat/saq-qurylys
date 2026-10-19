import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { openDatabase } from '../src/server/db/connection';
import { migrate } from '../src/server/db/migrations';
import { createUser, login, logout, sessionUser, hasRole, authEnabled } from '../src/server/auth/core';
let db: Awaited<ReturnType<typeof openDatabase>>;
beforeEach(async () => { db = (await openDatabase(':memory:')); (await migrate(db)); });
afterEach(() => { db.close(); vi.unstubAllEnvs(); });
const account = { username: 'analyst', name: 'Analyst', role: 'analyst', password: ' long secret password ' };
it('hashes credentials and tokens, preserves password whitespace and expires sessions', async () => {
    await createUser(db, account);
    const token = await login(db, account.username, account.password, 1000);
    expect((await sessionUser(db, token, 1001))?.username).toBe('analyst');
    expect((await db.prepare('SELECT password_hash FROM auth_users').get())?.password_hash).not.toContain(account.password);
    expect((await db.prepare('SELECT token_hash FROM auth_sessions').get())?.token_hash).not.toBe(token);
    expect((await sessionUser(db, token, 1000 + 8 * 3600 * 1000))).toBeNull();
    (await logout(db, token));
    expect((await sessionUser(db, token, 1001))).toBeNull();
});
it('rejects wrong passwords, unknown and disabled users', async () => {
    await createUser(db, account);
    await expect((login(db, 'missing', account.password))).rejects.toThrow('Неверный');
    await expect((login(db, account.username, 'wrong'))).rejects.toThrow('Неверный');
    const token = await login(db, account.username, account.password);
    (await db.prepare('UPDATE auth_users SET disabled=1').run());
    expect((await sessionUser(db, token))).toBeNull();
    await expect((login(db, account.username, account.password))).rejects.toThrow('Неверный');
});
it('persists throttling and allows retries after expiry', async () => {
    for (let i = 0; i < 10; i++)
        await expect((login(db, 'missing', 'wrong', 1000))).rejects.toThrow('Неверный');
    await expect((login(db, 'missing', 'wrong', 1000))).rejects.toThrow('Слишком много');
    await expect((login(db, 'missing', 'wrong', 1000 + 15 * 60000))).rejects.toThrow('Неверный');
});
it('enforces permission matrix and cannot disable auth in production', () => {
    for (const role of ['viewer', 'analyst', 'admin'] as const) {
        const u = { id: '1', username: 'u', name: 'U', role };
        expect(hasRole(u, 'read')).toBe(true);
        expect(hasRole(u, 'write')).toBe(role !== 'viewer');
        expect(hasRole(u, 'admin')).toBe(role === 'admin');
    }
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('SAQ_AUTH_MODE', 'local');
    expect(authEnabled()).toBe(true);
});

it('login cleanup preserves Telegram deduplication records', async () => {
    await createUser(db, account);
    await db.prepare('INSERT INTO auth_throttle VALUES(?,1,?)').run('telegram:update:42', 1000);
    await db.prepare('INSERT INTO auth_throttle VALUES(?,1,?)').run('expired-login', 1000);
    await login(db, account.username, account.password, 2000);
    expect(await db.prepare('SELECT attempts FROM auth_throttle WHERE key=?').get('telegram:update:42')).toEqual({attempts:1});
    expect(await db.prepare('SELECT attempts FROM auth_throttle WHERE key=?').get('expired-login')).toBeUndefined();
});

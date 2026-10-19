import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type {Database as DatabaseSync} from '../db/connection';
import { InputError, required } from '../../domain/analysis';
const scrypt = promisify(scryptCallback);
export type Role = 'admin' | 'analyst' | 'viewer';
export interface User {
    id: string;
    username: string;
    name: string;
    role: Role;
}
export const SESSION_SECONDS = 8 * 3600;
export function authEnabled() { return process.env.APP_ENV === 'production' || process.env.SAQ_AUTH_MODE !== 'local'; }
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export async function passwordHash(password: string) {
    if (password.length < 14 || password.length > 256)
        throw new InputError('Пароль: от 14 до 256 символов.');
    const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64) as Buffer;
    return `${salt}:${hash.toString('hex')}`;
}
async function verifyPassword(password: string, stored: string) {
    const [salt, hex] = stored.split(':');
    if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex || ''))
        return false;
    const actual = await scrypt(password, salt, 64) as Buffer;
    return timingSafeEqual(actual, Buffer.from(hex, 'hex'));
}
export async function createUser(db: DatabaseSync, input: {
    username: string;
    name: string;
    role: string;
    password: string;
}) {
    const username = required(input.username, 'Логин', 80).toLowerCase();
    if (!/^[a-z0-9._@-]{3,80}$/.test(username))
        throw new InputError('Логин: латинские буквы, цифры, точка, @, дефис.');
    if (!['admin', 'analyst', 'viewer'].includes(input.role))
        throw new InputError('Неизвестная роль.');
    const hash = await passwordHash(input.password), id = randomUUID();
    (await db.prepare('INSERT INTO auth_users(id,username,name,role,password_hash,created_at) VALUES(?,?,?,?,?,?)').run(id, username, required(input.name, 'Имя', 120), input.role, hash, new Date().toISOString()));
    return id;
}
async function throttle(db: DatabaseSync, key: string, limit: number, time: number) {
    (await db.prepare(`INSERT INTO auth_throttle VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END`).run(key, time + 15 * 60000, time, time));
    const row = (await db.prepare('SELECT attempts FROM auth_throttle WHERE key=?').get(key))!;
    if (Number(row.attempts) > limit)
        throw new InputError('Слишком много попыток входа. Повторите через 15 минут.');
}
export async function login(db: DatabaseSync, usernameInput: unknown, passwordInput: unknown, at = Date.now()) {
    const username = required(usernameInput, 'Логин', 80).toLowerCase(), password = typeof passwordInput === 'string' ? passwordInput : '';
    if (!password || password.length > 256)
        throw new InputError('Введите пароль (до 256 символов).');
    // Shared persistent limits cannot be bypassed with forged client IP headers.
    (await db.exec('BEGIN IMMEDIATE'));
    try {
        (await db.prepare("DELETE FROM auth_throttle WHERE reset_at<=? AND key NOT LIKE 'telegram:%'").run(at));
        (await throttle(db, 'all', 60, at));
        (await throttle(db, hashToken(username), 10, at));
        (await db.exec('COMMIT'));
    }
    catch (e) {
        if (db.isTransaction)
            (await db.exec(e instanceof InputError ? 'COMMIT' : 'ROLLBACK'));
        throw e;
    }
    const row = (await db.prepare('SELECT * FROM auth_users WHERE username=?').get(username)) as (User & {
        password_hash: string;
        disabled: number;
    }) | undefined;
    // Same expensive verification for unknown usernames.
    const valid = await verifyPassword(password, row?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`);
    if (!row || row.disabled || !valid) {
        (await db.prepare('INSERT INTO auth_events VALUES(?,?,?,?)').run(randomUUID(), row?.id ?? null, 'login_failed', new Date(at).toISOString()));
        throw new InputError('Неверный логин или пароль.');
    }
    // Recheck after asynchronous password verification: an administrator may disable the account meanwhile.
    if ((await db.prepare('SELECT disabled FROM auth_users WHERE id=?').get(row.id))?.disabled)
        throw new InputError('Неверный логин или пароль.');
    const token = randomBytes(32).toString('base64url');
    (await db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').run(at));
    (await db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(hashToken(token), row.id, at + SESSION_SECONDS * 1000));
    (await db.prepare('DELETE FROM auth_throttle WHERE key=?').run(hashToken(username)));
    (await db.prepare('INSERT INTO auth_events VALUES(?,?,?,?)').run(randomUUID(), row.id, 'login', new Date(at).toISOString()));
    return token;
}
export async function sessionUser(db: DatabaseSync, token: string | undefined, at = Date.now()): Promise<User | null> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
        return null;
    return (await db.prepare(`SELECT u.id,u.username,u.name,u.role FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>? AND u.disabled=0`).get(hashToken(token), at)) as User | undefined || null;
}
export async function logout(db: DatabaseSync, token: string) { (await db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(hashToken(token))); }
export function hasRole(user: User, permission: 'read' | 'write' | 'admin') { return permission === 'read' || user.role === 'admin' || permission === 'write' && user.role === 'analyst'; }

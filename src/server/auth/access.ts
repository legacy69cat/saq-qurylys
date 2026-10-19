import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { databasePath, openDatabase } from '../db/connection';
import { authEnabled, hasRole, sessionUser, type User } from './core';
import { InputError } from '../../domain/analysis';
export const SESSION_COOKIE = 'saq_session';
export async function currentUser(): Promise<User | null> {
    if (!authEnabled())
        return null;
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token)
        return null;
    const db = (await openDatabase(databasePath(), { readOnly: true }));
    try {
        return (await sessionUser(db, token));
    }
    finally {
        db.close();
    }
}
export async function requireAccess(permission: 'read' | 'write' | 'admin' = 'read') {
    if (!authEnabled())
        return null;
    const user = await currentUser();
    if (!user)
        redirect('/login');
    if (!hasRole(user, permission))
        throw new InputError('Недостаточно прав для этого действия.');
    return user;
}
export async function authorizeForm(form: FormData, permission: 'write' | 'admin' = 'write') {
    const user = await requireAccess(permission);
    if (user)
        form.set('actor', `${user.name} [${user.username}]`);
}

'use server';
import { safeReturnPath } from '../../domain/return-path';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { InputError } from '../../domain/analysis';
import { databasePath, openDatabase } from '../db/connection';
import { login, logout, SESSION_SECONDS, authEnabled } from './core';
import { SESSION_COOKIE } from './access';
import type { ActionState } from '../actions';
export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
    const next = safeReturnPath(form.get('next'));
    if (!authEnabled())
        redirect(next);
    const db = (await openDatabase(databasePath()));
    let token: string;
    try {
        token = await login(db, form.get('username'), form.get('password'));
    }
    catch (e) {
        return { error: e instanceof InputError ? e.message : 'Вход временно недоступен.' };
    }
    finally {
        db.close();
    }
    (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.APP_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
    const mode = new URL(next, 'https://saq.invalid').searchParams.get('simulation');
    if (mode === '0' || mode === '1') (await cookies()).set('saq_score_mode', mode, {httpOnly:true, secure:process.env.APP_ENV === 'production', sameSite:'lax', path:'/', maxAge:86400 * 7});
    redirect(next);
}
export async function logoutAction() {
    const jar = await cookies();
    const token = jar.get(SESSION_COOKIE)?.value;
    if (token) {
        const db = (await openDatabase(databasePath()));
        try {
            (await logout(db, token));
        }
        finally {
            db.close();
        }
    }
    jar.delete(SESSION_COOKIE);
    redirect('/login');
}

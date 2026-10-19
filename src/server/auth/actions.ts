'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { InputError } from '../../domain/analysis';
import { databasePath, openDatabase } from '../db/connection';
import { login, logout, SESSION_SECONDS, authEnabled } from './core';
import { SESSION_COOKIE } from './access';
import type { ActionState } from '../actions';
export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
    if (!authEnabled())
        redirect('/');
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
    redirect('/');
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

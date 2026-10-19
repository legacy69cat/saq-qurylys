'use server';
import { authorizeForm } from "../auth/access";
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { databasePath, openDatabase } from '../db/connection';
import { InputError, required } from '../../domain/analysis';
import type { ActionState } from '../actions';
import { searchLocation } from './photon';
import { createProjectFromPost } from '../db/location-projects';
const failure = (e: unknown): ActionState => ({ error: e instanceof InputError ? e.message : 'Не удалось сохранить. Обновите страницу и повторите.' });
export async function lookupAddressAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    const db = (await openDatabase(databasePath()));
    let id: string, postId: string;
    try {
        postId = required(form.get('postId'), 'Публикация', 100);
        id = await searchLocation(db, postId, form.get('address'), form.get('city'));
    }
    catch (e) {
        return failure(e);
    }
    finally {
        db.close();
    }
    redirect(`/monitoring/${encodeURIComponent(postId)}/location?search=${encodeURIComponent(id)}`);
}
export async function createLocatedProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    const db = (await openDatabase(databasePath()));
    let id: string;
    try {
        id = (await createProjectFromPost(db, Object.fromEntries(form)));
    }
    catch (e) {
        return failure(e);
    }
    finally {
        db.close();
    }
    revalidatePath('/');
    revalidatePath('/monitoring');
    revalidatePath(`/projects/${id}`);
    redirect(`/projects/${encodeURIComponent(id)}`);
}

"use server";
import { authorizeForm } from "../auth/access";
import { cancelQueuedJob } from "../db/collection-status";
import { revalidatePath } from "next/cache";
import type {Database as DatabaseSync} from '../db/connection';
import { InputError, required } from "../../domain/analysis";
import { databasePath, openDatabase } from "../db/connection";
import { acknowledgeUncertain, archivePost, createSearch, enableSearch, enqueue } from "../db/social";
import { installSearchPacks } from "../db/search-packs";
import type { ActionState } from "../actions";
async function change(work: (db: DatabaseSync) => void | Promise<void>): Promise<ActionState> {
    const db = (await openDatabase(databasePath()));
    try {
        await work(db);
        revalidatePath("/monitoring");
        return { message: "Сохранено." };
    }
    catch (error) {
        return { error: error instanceof InputError ? error.message : "Не удалось сохранить. Проверьте БД и повторите действие." };
    }
    finally {
        db.close();
    }
}
const id = (form: FormData) => required(form.get("id"), "Идентификатор", 100);
export async function createSearchAction(_: ActionState, form: FormData) {
    await authorizeForm(form, "admin");
    return (await change(async (db) => { (await createSearch(db, Object.fromEntries(form))); }));
}
export async function queueAction(_: ActionState, form: FormData) {
    await authorizeForm(form, "admin");
    return (await change(async (db) => { (await enqueue(db, id(form))); }));
}
export async function toggleSearchAction(_: ActionState, form: FormData) {
    await authorizeForm(form, "admin");
    return (await change(async (db) => { (await enableSearch(db, id(form), form.get("enabled") === "1")); }));
}
export async function archiveAction(_: ActionState, form: FormData) {
    await authorizeForm(form, "write");
    return (await change(async (db) => { (await archivePost(db, id(form), form.get("archived") === "1")); }));
}
export async function resolveAction(_: ActionState, form: FormData) {
    await authorizeForm(form, "admin");
    return (await change(async (db) => { if (form.get("checked") !== "on")
        throw new InputError("Сначала сверьте запуск в Apify Console."); (await acknowledgeUncertain(db, id(form))); }));
}
export async function installPacksAction(_: ActionState, form: FormData) {
    await authorizeForm(form, "admin");
    return (await change(async (db) => { (await installSearchPacks(db, form.get("city"), form.getAll("packs").map(String), form.get("enabled") === "on")); }));
}
export async function cancelJobAction(_: ActionState, form: FormData) {
    await authorizeForm(form, "admin");
    return (await change(async (db) => (await cancelQueuedJob(db, id(form)))));
}

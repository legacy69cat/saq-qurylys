"use server";
import { authorizeForm } from "./auth/access";
import { assessAd } from "../domain/ad-scoring";
import { addProject, linkCollectedPost, saveDocumentFactor } from "./db/registry";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { InputError, required } from "../domain/analysis";
import { databasePath, openDatabase } from "./db/connection";
import { addManualHypothesis, addPublication, createSignal, finishAnalysis, publicationById, projectById, reviewHypothesis, reviewSignal, saveLegalCheck, signalById, startAnalysis } from "./db/workflow";
import { aiConfigured, ANALYSIS_PROMPT_VERSION, analyzeAdvertisement } from "./ai/analyze";
import type {Database as DatabaseSync} from './db/connection';
export type ActionState = {
    error?: string;
    message?: string;
};
const values = (form: FormData) => Object.fromEntries(form.entries());
const field = (form: FormData, key: string) => required(form.get(key), key, 2000);
async function withDatabase<T>(work: (db: DatabaseSync) => T | Promise<T>): Promise<T> {
    const db = (await openDatabase(databasePath()));
    try {
        return await work(db);
    }
    finally {
        db.close();
    }
}
function refresh(projectId: string) {
    revalidatePath("/");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/signals/[id]", "page");
}
function failure(error: unknown): ActionState {
    return { error: error instanceof InputError ? error.message : "Не удалось сохранить данные. Проверьте подготовку БД (npm run db:setup) и повторите действие." };
}
export async function addPublicationAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    let projectId: string;
    try {
        projectId = field(form, "projectId");
        (await withDatabase(async (db) => (await addPublication(db, values(form)))));
        refresh(projectId);
    }
    catch (error) {
        return failure(error);
    }
    redirect(`/projects/${encodeURIComponent(projectId)}#publications`);
}
export async function analyzeAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    let runId: string | undefined;
    let projectId: string | undefined;
    try {
        if (!aiConfigured())
            throw new InputError("ИИ не настроен: добавьте AI_GATEWAY_API_KEY и AI_GATEWAY_MODEL в .env.local. Ручная проверка доступна.");
        const publication = (await withDatabase(async (db) => (await publicationById(db, field(form, "publicationId")))));
        projectId = publication.projectId;
        const name = (await withDatabase(async (db) => (await projectById(db, publication.projectId)).name));
        runId = (await withDatabase(async (db) => (await startAnalysis(db, publication.id, field(form, "actor"), process.env.AI_GATEWAY_MODEL!, ANALYSIS_PROMPT_VERSION))));
        const output = await analyzeAdvertisement(publication.text, name);
        (await withDatabase(async (db) => (await finishAnalysis(db, runId!, output))));
        refresh(projectId);
        return { message: output.suggestions.length ? "Анализ сохранён. Проверьте цитаты и примите решение по каждой гипотезе." : "Анализ завершён: гипотез R2/R3 нет. Это не подтверждение отсутствия риска." };
    }
    catch (error) {
        const result = failure(error);
        if (runId) {
            try {
                (await withDatabase(async (db) => (await finishAnalysis(db, runId!, null, result.error))));
            }
            catch { /* A timed-out run may already have been recovered. */ }
        }
        if (projectId)
            refresh(projectId);
        return result;
    }
}
export async function manualHypothesisAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    try {
        const projectId = (await withDatabase(async (db) => {
            const publication = (await publicationById(db, field(form, "publicationId")));
            (await addManualHypothesis(db, values(form)));
            return publication.projectId;
        }));
        refresh(projectId);
        return { message: "Ручная гипотеза сохранена. Подтвердите или отклоните её после проверки." };
    }
    catch (error) {
        return failure(error);
    }
}
export async function reviewHypothesisAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    try {
        const projectId = (await withDatabase(async (db) => {
            const id = field(form, "hypothesisId");
            const item = (await db.prepare("SELECT publication_id FROM suggestions WHERE id = ?").get(id));
            if (!item)
                throw new InputError("Гипотеза не найдена.");
            const publication = (await publicationById(db, String(item.publication_id)));
            (await reviewHypothesis(db, id, field(form, "decision"), field(form, "actor")));
            return publication.projectId;
        }));
        refresh(projectId);
        return { message: "Решение сохранено. Балл пересчитан." };
    }
    catch (error) {
        return failure(error);
    }
}
export async function legalCheckAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    try {
        const projectId = field(form, "projectId");
        (await withDatabase(async (db) => (await saveLegalCheck(db, values(form)))));
        refresh(projectId);
        return { message: "Проверка основания сохранена. Балл пересчитан." };
    }
    catch (error) {
        return failure(error);
    }
}
export async function createSignalAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    let id: string;
    try {
        const projectId = field(form, "projectId");
        id = (await withDatabase(async (db) => (await createSignal(db, projectId, field(form, "actor"), field(form, "requestId")))));
        refresh(projectId);
    }
    catch (error) {
        return failure(error);
    }
    redirect(`/signals/${encodeURIComponent(id)}`);
}
export async function reviewSignalAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    try {
        const projectId = (await withDatabase(async (db) => {
            const id = field(form, "signalId");
            (await reviewSignal(db, id, field(form, "decision"), field(form, "actor"), String(form.get("comment") || "")));
            return (await signalById(db, id)).project_id;
        }));
        refresh(projectId);
        return { message: "Решение по сигналу сохранено." };
    }
    catch (error) {
        return failure(error);
    }
}
export async function addProjectAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    let id: string;
    try {
        id = (await withDatabase(async (db) => (await addProject(db, values(form)))));
        refresh(id);
    }
    catch (e) {
        return failure(e);
    }
    redirect(`/projects/${encodeURIComponent(id)}`);
}
export async function linkPostAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    let id: string;
    try {
        id = (await withDatabase(async (db) => (await linkCollectedPost(db, values(form)))));
        refresh(id);
        revalidatePath("/monitoring");
    }
    catch (e) {
        return failure(e);
    }
    redirect(`/projects/${encodeURIComponent(id)}#publications`);
}
export async function documentFactorAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    try {
        const id = (await withDatabase(async (db) => (await saveDocumentFactor(db, values(form)))));
        refresh(id);
        return { message: "Проверка сохранена. Балл пересчитан." };
    }
    catch (e) {
        return failure(e);
    }
}
export async function ruleHypothesesAction(_: ActionState, form: FormData): Promise<ActionState> {
    await authorizeForm(form, "write");
    try {
        const projectId = (await withDatabase(async (db) => {
            const publication = (await publicationById(db, field(form, "publicationId")));
            const actor = field(form, "actor");
            const result = assessAd(publication.text, { publishedAt: publication.publishedAt });
            if (!result.signals.length)
                throw new InputError("Явных текстовых признаков нет. Доступна ручная проверка.");
            for (const signal of result.signals)
                (await addManualHypothesis(db, { requestId: `rule-${publication.id}-${signal.code}`, publicationId: publication.id, actor, code: signal.code, quote: signal.quote.slice(0, 2000), explanation: `Подбор по правилам ${result.version}, сохранён аналитиком. ${signal.reason}` }));
            return publication.projectId;
        }));
        refresh(projectId);
        return { message: "Гипотезы сохранены. Проверьте цитаты и подтвердите или отклоните каждую." };
    }
    catch (e) {
        return failure(e);
    }
}

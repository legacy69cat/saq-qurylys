import { randomUUID } from "node:crypto";
import type {Database as DatabaseSync} from './connection';
import { required, httpUrl, InputError, isoDate } from "../../domain/analysis";
import { addPublication } from "./workflow";
export async function addProject(db: DatabaseSync, data: Record<string, unknown>): Promise<string> {
    const name = required(data.name, "Название", 200), address = required(data.address, "Адрес", 500), developer = required(data.developer, "Застройщик", 200);
    const bin = String(data.bin || "").trim();
    if (bin && !/^\d{12}$/.test(bin))
        throw new InputError("БИН должен содержать 12 цифр; если неизвестен, оставьте пустым.");
    const latitude = data.latitude === "" || data.latitude == null ? null : Number(data.latitude);
    const longitude = data.longitude === "" || data.longitude == null ? null : Number(data.longitude);
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)))
        throw new InputError("Укажите обе корректные координаты или оставьте их пустыми.");
    const stage = data.stage;
    if (!['construction', 'commissioned'].includes(String(stage)))
        throw new InputError("Укажите стадию объекта.");
    const source = required(data.source, "Источник", 200), url = httpUrl(data.sourceUrl), actor = required(data.actor, "Автор", 200);
    const createdAt = new Date().toISOString();
    const capturedAt = data.capturedAt ? isoDate(data.capturedAt) : createdAt;
    const id = data.requestId ? required(data.requestId, "Идентификатор", 100) : randomUUID();
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction)
        (await db.exec("BEGIN IMMEDIATE"));
    try {
        const previous = (await db.prepare("SELECT name,address FROM projects WHERE id=?").get(id));
        if (previous) {
            if (previous.name !== name || previous.address !== address)
                throw new InputError("Форма уже использована. Обновите страницу перед добавлением другого объекта.");
            if (ownsTransaction)
                (await db.exec("COMMIT"));
            return id;
        }
        const existing = bin ? (await db.prepare("SELECT id FROM developers WHERE bin=?").get(bin)) : null;
        const devId = existing ? String(existing.id) : `developer-${id}`;
        if (!existing)
            (await db.prepare("INSERT INTO developers VALUES (?,?,?,0)").run(devId, developer, bin || `unknown:${devId}`));
        (await db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?,?,'',0,?)").run(id, name, address, devId, String(stage), latitude, longitude, createdAt));
        (await db.prepare("INSERT INTO legal_checks (project_id,basis_type,status) VALUES (?,'unknown','unknown')").run(id));
        (await db.prepare("INSERT INTO project_sources VALUES (?,?,?,?)").run(id, source, url, capturedAt));
        (await db.prepare("INSERT INTO evidence VALUES (?,?,'progress',?,?,?,?,0)").run(`source-${id}`, id, source, url, `Объект: ${name}. Адрес: ${address}. Стадия по источнику: ${stage === 'construction' ? 'строящийся' : 'введён'}. Координаты: ${latitude ?? 'не указаны'}, ${longitude ?? 'не указаны'}. Правовое основание не проверено.`, capturedAt));
        (await db.prepare("INSERT INTO audit_events VALUES (?,?,?,?,?,?)").run(randomUUID(), id, actor, "Объект добавлен", `${source} · ${url}`, createdAt));
        if (ownsTransaction)
            (await db.exec("COMMIT"));
        return id;
    }
    catch (e) {
        if (ownsTransaction)
            (await db.exec("ROLLBACK"));
        throw e;
    }
}
export async function linkCollectedPost(db: DatabaseSync, data: Record<string, unknown>) {
    const postId = required(data.postId, "Публикация", 100), projectId = required(data.projectId, "ЖК", 100), actor = required(data.actor, "Автор", 200);
    const post = (await db.prepare("SELECT * FROM collected_posts WHERE id=?").get(postId));
    if (!post)
        throw new InputError("Публикация не найдена.");
    const project = (await db.prepare("SELECT is_demo FROM projects WHERE id=?").get(projectId));
    if (!project || project.is_demo)
        throw new InputError("Выберите реальный объект.");
    if (data.confirmLink !== "on")
        throw new InputError("Подтвердите совпадение объекта по адресу или застройщику.");
    const old = (await db.prepare("SELECT publication_id FROM collected_links WHERE post_id=?").get(postId));
    if (old)
        throw new InputError("Публикация уже привязана к объекту.");
    const publishedAt = post.published_at || data.publishedAt;
    if (!publishedAt)
        throw new InputError("Источник не указал дату. Проверьте оригинал и внесите дату публикации.");
    if (!String(post.text).trim())
        throw new InputError("Нет текста публикации. Добавьте расшифровку вручную в карточке объекта.");
    // Stable publication ID makes recovery after interruption safe; addPublication validates identical input.
    const publicationId = (await addPublication(db, { requestId: `collected-${postId}`, projectId, actor, text: post.text, platform: post.platform, account: post.account || "Не указан", url: post.url, publishedAt }));
    (await db.prepare("UPDATE evidence SET captured_at=? WHERE id=?").run(post.first_seen_at, publicationId));
    (await db.prepare("INSERT OR IGNORE INTO collected_links VALUES (?,?,?,?)").run(postId, publicationId, actor, new Date().toISOString()));
    return projectId;
}
export async function saveDocumentFactor(db: DatabaseSync, data: Record<string, unknown>) {
    const projectId = required(data.projectId, "ЖК"), actor = required(data.actor, "Автор", 200), code = String(data.code);
    if (!['R4', 'R5', 'R6'].includes(code))
        throw new InputError("Недопустимый фактор.");
    const decision = String(data.decision);
    if (!['confirmed', 'rejected'].includes(decision))
        throw new InputError("Укажите решение.");
    const project = (await db.prepare("SELECT is_demo FROM projects WHERE id=?").get(projectId));
    if (!project)
        throw new InputError("Объект не найден.");
    if (data.verified !== "on")
        throw new InputError("Подтвердите проверку материалов.");
    const source = required(data.source, "Источник", 200), url = httpUrl(data.url), text = required(data.text, "Вывод", 12000), observedAt = isoDate(data.observedAt);
    const id = required(data.requestId, "Идентификатор", 100), date = new Date().toISOString();
    const claimed = Number(data.claimed), verified = Number(data.actual);
    const second = code === 'R5' && decision === 'confirmed' ? { source: required(data.actualSource, "Источник фактической готовности", 200), url: httpUrl(data.actualUrl), date: isoDate(data.actualDate) } : null;
    if (second && (data.claimed === '' || data.actual === '' || !Number.isFinite(claimed) || !Number.isFinite(verified) || claimed < 0 || claimed > 100 || verified < 0 || verified > 100))
        throw new InputError("Обе оценки готовности должны быть от 0 до 100%.");
    if (second && Math.abs(claimed - verified) < 20)
        throw new InputError("Для R5 требуется расхождение не менее 20 п.п.");
    const ownsTransaction = !db.isTransaction;
    if (ownsTransaction)
        (await db.exec("BEGIN IMMEDIATE"));
    try {
        if ((await db.prepare("SELECT id FROM evidence WHERE id=?").get(id)))
            throw new InputError("Проверка уже сохранена. Обновите страницу.");
        (await db.prepare("INSERT INTO reviewers VALUES (?,?,?) ON CONFLICT DO NOTHING").run(actor, actor, project.is_demo));
        const kind = code === 'R4' ? 'complaint' : code === 'R6' ? 'delay' : 'progress';
        (await db.prepare("INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?)").run(id, projectId, kind, source, url, `${text}\nДата материала: ${observedAt}`, date, project.is_demo));
        (await db.prepare("INSERT INTO factors VALUES (?,?,?,?,?,?) ON CONFLICT(project_id,code) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at").run(randomUUID(), projectId, code, decision, actor, date));
        const factor = (await db.prepare("SELECT id FROM factors WHERE project_id=? AND code=?").get(projectId, code))!;
        (await db.prepare("DELETE FROM factor_evidence WHERE factor_id=?").run(factor.id));
        (await db.prepare("INSERT INTO factor_evidence VALUES (?,?,?)").run(factor.id, id, projectId));
        if (second) {
            (await db.prepare("INSERT INTO evidence VALUES (?,?,'progress',?,?,?,?,?)").run(`${id}-actual`, projectId, second.source, second.url, `Фактическая готовность: ${verified}%. ${text}\nДата материала: ${second.date}`, date, project.is_demo));
            // Keep former observations in evidence/audit; replace the active comparable pair together.
            (await db.prepare("DELETE FROM progress_observations WHERE project_id=?").run(projectId));
            (await db.prepare("INSERT INTO progress_observations VALUES (?,?,?,?,?,?)").run(`${id}-claimed`, projectId, 'claimed', claimed, id, observedAt));
            (await db.prepare("INSERT INTO progress_observations VALUES (?,?,?,?,?,?)").run(`${id}-verified`, projectId, 'verified', verified, `${id}-actual`, second.date));
            (await db.prepare("INSERT INTO factor_evidence VALUES (?,?,?)").run(factor.id, `${id}-actual`, projectId));
        }
        (await db.prepare("INSERT INTO audit_events VALUES (?,?,?,?,?,?)").run(randomUUID(), projectId, actor, "Проверка документального фактора", `${code} · ${decision} · ${text}${second ? ` · ${claimed}% / ${verified}%` : ''}`, date));
        if (ownsTransaction)
            (await db.exec("COMMIT"));
        return projectId;
    }
    catch (e) {
        if (ownsTransaction)
            (await db.exec("ROLLBACK"));
        throw e;
    }
}

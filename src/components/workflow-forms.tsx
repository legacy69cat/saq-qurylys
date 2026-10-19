import { currentUser } from "@/server/auth/access";
import { randomUUID } from "node:crypto";
import { ActionForm } from "./action-form";
import { documentFactorAction, addPublicationAction, createSignalAction, legalCheckAction } from "@/server/actions";
export async function AuthorField() { const user = await currentUser(); if (user)
    return <p className="muted">Автор: {user.name} ({user.username})</p>; return <label>Автор решения<input name="actor" required maxLength={200} placeholder="Имя или рабочий псевдоним" autoComplete="off"/></label>; }
export function RequestId() { return <input type="hidden" name="requestId" value={randomUUID()}/>; }
export function PublicationForm({ projectId }: {
    projectId: string;
}) {
    return <ActionForm action={addPublicationAction} label="Сохранить публикацию">
    <RequestId /><input type="hidden" name="projectId" value={projectId}/>
    <p>Публикация будет привязана к этому ЖК. Убедитесь, что текст относится к нему.</p>
    <div className="form-grid"><label>Площадка<input name="platform" required maxLength={200} placeholder="Сайт, Telegram, Instagram"/></label><label>Аккаунт / источник<input name="account" required maxLength={200}/></label></div>
    <label>Ссылка на публикацию<input type="url" name="url" required maxLength={2000} placeholder="https://…"/></label>
    <label>Дата публикации<input type="date" name="publishedAt" required max={new Date().toISOString().slice(0, 10)}/></label>
    <label>Текст публикации<textarea name="text" required maxLength={12000} rows={5}/></label><AuthorField />
  </ActionForm>;
}
export function LegalCheckForm({ projectId }: {
    projectId: string;
}) {
    return <ActionForm action={legalCheckAction} label="Сохранить проверку основания">
    <RequestId /><input type="hidden" name="projectId" value={projectId}/>
    <p>Нет записи в поиске или доступа к реестру — выберите «Не установлено». R1 начисляется только при документированном отсутствии всех применимых оснований.</p>
    <label>Результат<select name="status" defaultValue="unknown"><option value="unknown">Не установлено / нужна проверка</option><option value="present">Основание подтверждено</option><option value="absent">Отсутствие основания установлено</option></select></label>
    <label>Вид подтверждённого основания<select name="basisType"><option value="guarantee">Гарантия Единого оператора</option><option value="mio_permission">Разрешение МИО</option><option value="other">Иное применимое основание</option></select></label>
    <label>Источник проверки<input name="source" required maxLength={200} placeholder="Реестр, документ, дата документа"/></label>
    <label>Ссылка на материал<input name="url" type="url" required maxLength={2000}/></label>
    <label>Результат и основания вывода<textarea name="text" required rows={4} maxLength={12000}/></label>
    <label className="checkbox-label"><input name="verifiedAbsence" type="checkbox" value="yes"/> Для вывода об отсутствии: я проверил все применимые способы привлечения средств и сохранил подтверждающие сведения.</label>
    <AuthorField />
  </ActionForm>;
}
export function SignalForm({ projectId }: {
    projectId: string;
}) {
    return <ActionForm action={createSignalAction} label="Создать сигнальную карточку">
    <RequestId /><input type="hidden" name="projectId" value={projectId}/>
    <p>Сохраняется снимок текущего балла и материалов. Если версия уже ожидает решения, откроется она.</p><AuthorField />
  </ActionForm>;
}
export function DocumentFactorForm({ projectId, code }: {
    projectId: string;
    code: "R4" | "R5" | "R6";
}) {
    return <ActionForm action={documentFactorAction} label={`Сохранить проверку ${code}`}><RequestId /><input type="hidden" name="projectId" value={projectId}/><input type="hidden" name="code" value={code}/>
    <label>Решение<select name="decision"><option value="confirmed">Подтверждён</option><option value="rejected">Не подтверждён / отменить начисление</option></select></label>
    <label>Источник материала<input name="source" required maxLength={200}/></label><label>Ссылка на материал<input name="url" type="url" required maxLength={2000}/></label><label>Дата материала<input name="observedAt" type="date" required max={new Date().toISOString().slice(0, 10)}/></label><label>Вывод проверки<textarea name="text" required maxLength={12000} rows={3}/></label>
    {code === 'R5' ? <><p>Для подтверждения нужны две сопоставимые оценки с расхождением от 20 п.п.</p><label>Заявленная готовность, %<input name="claimed" type="number" min="0" max="100" step="any"/></label><label>Фактическая готовность, %<input name="actual" type="number" min="0" max="100" step="any"/></label><label>Источник фактической готовности<input name="actualSource" maxLength={200}/></label><label>Ссылка на фактическую готовность<input name="actualUrl" type="url" maxLength={2000}/></label><label>Дата фактической оценки<input name="actualDate" type="date" max={new Date().toISOString().slice(0, 10)}/></label></> : null}
    <label className="checkbox-label"><input name="verified" type="checkbox" required/>Проверены {code === 'R4' ? 'коллективный характер обращения и его связь с объектом' : code === 'R5' ? 'сопоставимость оценок, даты и источники' : 'документы о простое или нарушении срока'}</label><AuthorField /></ActionForm>;
}

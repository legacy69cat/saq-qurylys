import { requireAccess } from "@/server/auth/access";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { AuthorField, RequestId } from "@/components/workflow-forms";
import { addProjectAction } from "@/server/actions";
export const dynamic = "force-dynamic";
export default async function NewProject() {
    await requireAccess("write");
    return <main id="main" className="page detail-page"><Link href="/">← Обзор</Link><h1>Добавить объект</h1><ActionForm action={addProjectAction} label="Сохранить объект"><RequestId />
    <label>Название ЖК<input name="name" required maxLength={200}/></label><label>Адрес<input name="address" required maxLength={500}/></label><label>Застройщик<input name="developer" required maxLength={200}/></label><label>БИН, если установлен<input name="bin" pattern="[0-9]{12}" maxLength={12}/></label>
    <label>Стадия<select name="stage"><option value="construction">Строительство</option><option value="commissioned">Введён в эксплуатацию</option></select></label>
    <div className="form-grid"><label>Широта<input name="latitude" type="number" step="any" min="-90" max="90"/></label><label>Долгота<input name="longitude" type="number" step="any" min="-180" max="180"/></label></div><p>Для отметки на карте укажите обе координаты из источника.</p>
    <label>Источник сведений<input name="source" required maxLength={200}/></label><label>Ссылка на источник<input name="sourceUrl" type="url" required maxLength={2000}/></label><AuthorField /></ActionForm></main>;
}

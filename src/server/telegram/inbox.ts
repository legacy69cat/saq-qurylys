import type {Database} from '../db/connection';
import {required,InputError} from '../../domain/analysis';
export type InboxItem={id:string;text:string;kind:'text'|'photo';created_at:string;status:'new'|'reviewing'|'closed';reviewed_by:string|null;reviewed_at:string|null;comment:string};
export async function saveSubmission(db:Database,updateId:number,text:string,kind:'text'|'photo'){
 if(!Number.isSafeInteger(updateId)||updateId<0)throw new InputError('Некорректный идентификатор');
 const id=`tg-${updateId}`;
 await db.prepare('INSERT INTO telegram_inbox(id,text,kind,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING').run(id,text.slice(0,16000),kind,new Date().toISOString());return id;
}
export async function reviewSubmission(db:Database,id:string,status:string,comment:string,actor:string){
 if(!['new','reviewing','closed'].includes(status))throw new InputError('Некорректный статус');
 actor=required(actor,'Автор',200);if(comment.length>4000)throw new InputError('Комментарий: до 4000 символов');
 if(status==='closed'&&!comment.trim())throw new InputError('Для завершения укажите результат проверки.');
 const row=await db.prepare('SELECT id FROM telegram_inbox WHERE id=?').get(id);if(!row)throw new InputError('Обращение не найдено');
 await db.prepare('UPDATE telegram_inbox SET status=?,comment=?,reviewed_by=?,reviewed_at=? WHERE id=?').run(status,comment,actor,new Date().toISOString(),id);
}

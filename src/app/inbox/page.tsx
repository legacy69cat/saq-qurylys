import Link from 'next/link';
import {requireAccess} from '@/server/auth/access';
import {databasePath,openDatabase} from '@/server/db/connection';
import type {InboxItem} from '@/server/telegram/inbox';
import {AdAssessmentCard} from '@/components/ad-assessment';
import {ActionForm} from '@/components/action-form';
import {AuthorField} from '@/components/workflow-forms';
import {reviewInboxAction} from './actions';
export const dynamic='force-dynamic';
export default async function InboxPage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
 await requireAccess();const params=await searchParams;const page=Math.max(1,Math.min(10000,Math.floor(Number(params.page)||1)));const closed=params.closed==='1';
 const db=await openDatabase(databasePath(),{readOnly:true});
 let rows:InboxItem[];
 try{rows=await db.prepare(`SELECT * FROM telegram_inbox WHERE ${closed?"status='closed'":"status!='closed'"} ORDER BY created_at DESC LIMIT 31 OFFSET ?`).all((page-1)*30) as InboxItem[];}finally{db.close();}
 return <main id="main" className="page detail-page"><Link href="/">Вернуться в реестр</Link><h1>Обращения из Telegram</h1><p>Входящие объявления и результаты проверки. Для снимков сверьте распознанный текст. Указано время получения обращения.</p><p><Link href="/inbox">В работе</Link> · <Link href="/inbox?closed=1">Завершённые</Link></p>
 {!rows.length?<p>Обращений пока нет.</p>:rows.slice(0,30).map(row=><article className="evidence-item" key={row.id} id={row.id}><h2>{row.id} · {row.status==='new'?'Новое':row.status==='reviewing'?'На проверке':'Завершено'}</h2><p>{new Date(row.created_at).toLocaleString('ru-RU',{timeZone:'Asia/Almaty'})} (Алматы) · {row.kind==='photo'?'Снимок / распознанный текст':'Текст'}</p><p style={{whiteSpace:'pre-wrap'}}>{row.text}</p><AdAssessmentCard text={row.text}/><ActionForm action={reviewInboxAction} label={`Сохранить решение ${row.id}`}><input type="hidden" name="id" value={row.id}/><label>Статус<select name="status" defaultValue={row.status}><option value="new">Новое</option><option value="reviewing">На проверке</option><option value="closed">Завершено</option></select></label><label>Результат проверки<textarea name="comment" defaultValue={row.comment} maxLength={4000}/></label><AuthorField/></ActionForm>{row.reviewed_by?<p>Последнее решение: {row.reviewed_by} · {row.reviewed_at}</p>:null}</article>)}
 <nav aria-label="Страницы обращений">{page>1?<Link href={`/inbox?closed=${Number(closed)}&page=${page-1}`}>Назад</Link>:null} {rows.length>30?<Link href={`/inbox?closed=${Number(closed)}&page=${page+1}`}>Далее</Link>:null}</nav></main>;
}

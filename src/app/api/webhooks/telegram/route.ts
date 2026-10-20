import {saveSubmission} from '../../../../server/telegram/inbox';
import {timingSafeEqual} from 'node:crypto';
import {databasePath,openDatabase} from '../../../../server/db/connection';
import {claimUpdate,finishUpdate} from '../../../../server/telegram/state';
import {downloadPhoto,sendText} from '../../../../server/telegram/api';
import {BOT_HELP,BOT_PRIVACY,photoReport,textReport} from '../../../../server/telegram/report';
export const runtime='nodejs';export const maxDuration=120;
export async function POST(request:Request){
 const secret=process.env.TELEGRAM_WEBHOOK_SECRET,provided=request.headers.get('x-telegram-bot-api-secret-token')||'';
 if(!secret||!process.env.TELEGRAM_BOT_TOKEN)return new Response(null,{status:503});
 if(Buffer.byteLength(secret)!==Buffer.byteLength(provided)||!timingSafeEqual(Buffer.from(secret),Buffer.from(provided)))return new Response(null,{status:401});
 let data;
 try{const reader=request.body?.getReader();if(!reader)throw new Error();let size=0;const parts:Uint8Array[]=[];while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>64000){await reader.cancel();return new Response(null,{status:413});}parts.push(p.value);}data=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{return new Response(null,{status:400});}
 if(!Number.isSafeInteger(data?.update_id))return new Response(null,{status:400});
 const m=data.message;
 if(!m||m.chat?.type!=='private'||!Number.isSafeInteger(m.chat?.id)||m.from?.is_bot)return Response.json({ok:true});
 const db=await openDatabase(databasePath());
 try{
  const state=await claimUpdate(db,data.update_id,m.chat.id);
  if(state==='done')return Response.json({ok:true});
  if(state==='busy')return new Response(null,{status:503});
  if(state==='limited'){await sendText(m.chat.id,'Лимит проверок временно исчерпан. На пользователя доступно 10 запросов в час; действует общий дневной лимит бота. Попробуйте позже.');await finishUpdate(db,data.update_id);return Response.json({ok:true});}
  let reply:string;
  const incoming=typeof m.text==='string'?m.text:'';
  const photoInput=Array.isArray(m.photo)&&m.photo.length>0;
  const command=/^\/(start|help|privacy)(?:@\w+)?(?:\s|$)/.test(incoming);
  let submissionId:string|undefined;
  if(!command&&(incoming.trim()||photoInput))submissionId=await saveSubmission(db,data.update_id,photoInput?`${typeof m.caption==='string'?m.caption.slice(0,1024):''}\n[Снимок получен. Текст ещё не распознан; оригинал не хранится в SAQ.]`:incoming,photoInput?'photo':'text');
  try{
   const text=typeof m.text==='string'?m.text:'';
   if(/^\/privacy(?:@\w+)?(?:\s|$)/.test(text))reply=BOT_PRIVACY;
   else if(/^\/(start|help)(?:@\w+)?(?:\s|$)/.test(text))reply=BOT_HELP;
   else if(Array.isArray(m.photo)&&m.photo.length){const photo=m.photo.at(-1);if(typeof photo?.file_id!=='string'||(photo.file_size??0)>5_000_000)throw new Error();reply=await photoReport(await downloadPhoto(photo.file_id),typeof m.caption==='string'?m.caption.slice(0,1024):'',async recognized=>{await db.prepare("UPDATE telegram_inbox SET text=? WHERE id=? AND status='new'").run(recognized.slice(0,16000),submissionId!);});}
   else if(text.trim())reply=textReport(text);
   else reply='Пришлите текст объявления или один скриншот как фото. Видео, файлы и голосовые пока не поддерживаются. /help — помощь.';
  }catch{reply='Не удалось проверить объявление. Попробуйте прислать текст вместо снимка или повторите позже. Оценка риска не сформирована.';}
  if(submissionId)reply+=`\n\nОбращение ${submissionId} принято на проверку.`;
  await sendText(m.chat.id,reply);await finishUpdate(db,data.update_id);return Response.json({ok:true});
 }catch{return new Response(null,{status:503});}finally{db.close();}
}

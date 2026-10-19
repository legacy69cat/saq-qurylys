import {currentUser} from '../../../../server/auth/access';
import {authEnabled,hasRole} from '../../../../server/auth/core';
import {databasePath,openDatabase} from '../../../../server/db/connection';
import {ocrConfigured,recognizeAdPhoto} from '../../../../server/ai/ocr';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request){
 const user=await currentUser();
 if(authEnabled()&&!user)return Response.json({error:'Требуется вход'},{status:401});
 if(user&&!hasRole(user,'write'))return Response.json({error:'Нужна роль аналитика'},{status:403});
 if(request.headers.get('origin')!==(process.env.APP_URL||new URL(request.url).origin))return Response.json({error:'Недопустимый источник запроса'},{status:403});
 if(!ocrConfigured())return Response.json({error:'Распознавание пока недоступно. Вставьте текст объявления.'},{status:503});
 let bytes:Uint8Array;
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();let size=0;const parts:Uint8Array[]=[];
  while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>3_200_000){await reader.cancel();return Response.json({error:'Скриншот должен быть до 3 МБ.'},{status:413});}parts.push(p.value);}
  const form=await new Response(Buffer.concat(parts),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
  const file=form.get('image');if(form.get('consent')!=='yes'||!(file instanceof File)||!file.size||file.size>3_000_000||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error();
  bytes=new Uint8Array(await file.arrayBuffer());
 }catch{return Response.json({error:'Выберите один скриншот JPEG, PNG или WebP до 3 МБ и подтвердите отправку ИИ.'},{status:400});}
 const db=await openDatabase(databasePath());
 try{
  await db.exec('BEGIN IMMEDIATE');const now=Date.now(),key='ad-ocr:'+(user?.id||'local');
  const usage=await db.prepare('SELECT attempts,reset_at FROM auth_throttle WHERE key=?').get(key);
  if(usage&&Number(usage.reset_at)>now&&Number(usage.attempts)>=10){await db.exec('ROLLBACK');return Response.json({error:'Лимит распознавания: 10 попыток в час. Можно продолжить проверку текста.'},{status:429});}
  await db.prepare('INSERT INTO auth_throttle VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').run(key,now+3600000,now,now);await db.exec('COMMIT');
 }finally{if(db.isTransaction)await db.exec('ROLLBACK');db.close();}
 try{const text=await recognizeAdPhoto(bytes);return Response.json({text},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Не удалось распознать снимок. Проверьте качество или вставьте текст объявления вручную.'},{status:502});}
}

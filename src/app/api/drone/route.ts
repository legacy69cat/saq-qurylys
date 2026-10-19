import {currentUser} from '../../../server/auth/access';
import {authEnabled,hasRole} from '../../../server/auth/core';
import {databasePath,openDatabase} from '../../../server/db/connection';
import {analyzeDrone,droneConfigured,normalizeDroneImage} from '../../../server/drone/analyze';
import {DRONE_VERSION} from '../../../domain/drone';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request){
 const user=await currentUser();if(authEnabled()&&!user)return Response.json({error:'Требуется вход'},{status:401});
 if(user&&!hasRole(user,'write'))return Response.json({error:'Нужна роль аналитика'},{status:403});
 const origin=request.headers.get('origin');const expected=process.env.APP_URL||new URL(request.url).origin;
 if(origin!==expected)return Response.json({error:'Недопустимый источник запроса'},{status:403});
 if(!droneConfigured())return Response.json({error:'Анализ ИИ не настроен. Доступен ручной осмотр.'},{status:503});
 if(Number(request.headers.get('content-length')||0)>3_500_000)return Response.json({error:'Слишком большой запрос'},{status:413});
 let bytes:Uint8Array[];
 try{
  const reader=request.body?.getReader();if(!reader)throw new Error();const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>3_500_000){await reader.cancel();return Response.json({error:'Слишком большой запрос'},{status:413});}chunks.push(part.value);}
  const form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();
  if(form.get('consent')!=='yes')throw new Error();const files=form.getAll('images');if(files.length<1||files.length>3)throw new Error();bytes=[];
  for(const file of files){if(!(file instanceof File)||!file.size||file.size>1_000_000)throw new Error();bytes.push(await normalizeDroneImage(new Uint8Array(await file.arrayBuffer())));}
 }catch{return Response.json({error:'Загрузите от 1 до 3 корректных снимков JPEG, PNG или WebP.'},{status:400});}
 const db=await openDatabase(databasePath());
 try{
  await db.exec('BEGIN IMMEDIATE');const now=Date.now(),key='drone:'+ (user?.id||'local');
  const row=await db.prepare('SELECT attempts,reset_at FROM auth_throttle WHERE key=?').get(key);
  if(row&&Number(row.reset_at)>now&&Number(row.attempts)>=5){await db.exec('ROLLBACK');return Response.json({error:'Лимит: 5 попыток анализа в час. Повторите позже.'},{status:429});}
  await db.prepare('INSERT INTO auth_throttle VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').run(key,now+3600000,now,now);await db.exec('COMMIT');
 }finally{if(db.isTransaction)await db.exec('ROLLBACK');db.close();}
 try{return Response.json({findings:await analyzeDrone(bytes),version:DRONE_VERSION,createdAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'ИИ не завершил анализ. Проверьте доступ к модели или повторите позже. Автоматический повтор отключён.'},{status:502});}
}

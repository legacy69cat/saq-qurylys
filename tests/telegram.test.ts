import {it,expect,vi,afterEach} from 'vitest';
import {openDatabase} from '../src/server/db/connection';
import {claimUpdate,finishUpdate} from '../src/server/telegram/state';
import {textReport,photoReport} from '../src/server/telegram/report';
import {POST} from '../src/app/api/webhooks/telegram/route';
import {sendText,downloadPhoto} from '../src/server/telegram/api';
vi.mock('ai',()=>({generateText:vi.fn(async()=>({output:{text:'ЖК строится. Внесите депозит 400 000 тенге.'}})),jsonSchema:(s:unknown)=>s,Output:{object:(s:unknown)=>s}}));
vi.mock('../src/server/drone/analyze',()=>({normalizeDroneImage:async(b:Uint8Array)=>b}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('deduplicates updates durably, recovers expired claims and enforces user quota',async()=>{
 const db=await openDatabase(':memory:');await db.exec('CREATE TABLE auth_throttle(key TEXT PRIMARY KEY,attempts INTEGER,reset_at INTEGER)');const now=Date.now();
 try{expect(await claimUpdate(db,1,10,now)).toBe('claimed');expect(await claimUpdate(db,1,10,now+1)).toBe('busy');await finishUpdate(db,1);expect(await claimUpdate(db,1,10,now+100000)).toBe('done');
 for(let id=2;id<=10;id++)expect(await claimUpdate(db,id,10,now)).toBe('claimed');expect(await claimUpdate(db,11,10,now)).toBe('limited');expect(await claimUpdate(db,12,20,now)).toBe('claimed');expect(await claimUpdate(db,12,20,now+180001)).toBe('claimed');}finally{db.close();}
});
it('requires webhook secret before touching data',async()=>{
 vi.stubEnv('TELEGRAM_BOT_TOKEN','test');vi.stubEnv('TELEGRAM_WEBHOOK_SECRET','secret');const req=(token:string,body:string)=>new Request('https://site/api/webhooks/telegram',{method:'POST',headers:{'x-telegram-bot-api-secret-token':token},body});
 expect((await POST(req('wrong','{}'))).status).toBe(401);expect((await POST(req('secret','x'.repeat(64001)))).status).toBe(413);expect((await POST(req('secret','{}'))).status).toBe(400);expect((await POST(req('secret',JSON.stringify({update_id:1,message:{chat:{id:1,type:'group'}}})))).status).toBe(200);
});
it('scores text without declaring full risk and does not fetch links',()=>{
 expect(textReport('https://example.com/ad')).toContain('недостаточно данных');const r=textReport('ЖК строится. Внесите депозит 400 000 тенге.');expect(r).toContain('Предварительные баллы: 35');expect(r).toContain('Полный риск объекта: не определён');
});
it('labels OCR evidence and uses the same scoring rules',async()=>{vi.stubEnv('AI_GATEWAY_API_KEY','test');vi.stubEnv('DRONE_AI_MODEL','test');const r=await photoReport(new Uint8Array([1]));expect(r).toContain('ИИ мог ошибиться');expect(r).toContain('Предварительные баллы: 35');expect(r).not.toContain('Изображения, видео и речь не анализировались.');});
it('sends plain text in bounded chunks and refuses unsafe download paths',async()=>{
 vi.stubEnv('TELEGRAM_BOT_TOKEN','test');const mock=vi.fn(async()=>Response.json({ok:true,result:{file_path:'../../external'}}));vi.stubGlobal('fetch',mock);await sendText(123,'<b>untrusted</b>'.repeat(400));for(const call of mock.mock.calls){const body=JSON.parse((call as unknown as [string,RequestInit])[1].body as string);expect(body.parse_mode).toBeUndefined();expect(body.text.length).toBeLessThanOrEqual(3500);}await expect(downloadPhoto('file')).rejects.toThrow('Unsupported photo');
});
it('delivers a scored reply once for repeated Telegram updates',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'saq-bot-'));const path=join(dir,'test.sqlite');
 vi.stubEnv('TURSO_DATABASE_URL','');vi.stubEnv('VERCEL','');vi.stubEnv('DATABASE_PATH',path);vi.stubEnv('TELEGRAM_BOT_TOKEN','test');vi.stubEnv('TELEGRAM_WEBHOOK_SECRET','secret');
 const db=await openDatabase(path,{create:true});await db.exec('CREATE TABLE auth_throttle(key TEXT PRIMARY KEY,attempts INTEGER,reset_at INTEGER)');db.close();
 const sent=vi.fn(async()=>Response.json({ok:true,result:{message_id:1}}));vi.stubGlobal('fetch',sent);
 const req=()=>new Request('https://site/api/webhooks/telegram',{method:'POST',headers:{'x-telegram-bot-api-secret-token':'secret'},body:JSON.stringify({update_id:42,message:{chat:{id:123,type:'private'},text:'ЖК строится. Внесите депозит 400 000 тенге.'}})});
 try{expect((await POST(req())).status).toBe(200);expect((await POST(req())).status).toBe(200);expect(sent).toHaveBeenCalledTimes(1);const body=JSON.parse((sent.mock.calls[0] as unknown as [string,RequestInit])[1].body as string);expect(body.chat_id).toBe(123);expect(body.text).toContain('Предварительные баллы: 35');}finally{rmSync(dir,{recursive:true,force:true});}
});

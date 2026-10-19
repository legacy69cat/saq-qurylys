import {it,expect,vi,afterEach} from 'vitest';
const state=vi.hoisted(()=>({user:{id:'u',role:'analyst'} as {id:string;role:string}|null,configured:true}));
vi.mock('../src/server/auth/access',()=>({currentUser:async()=>state.user}));
vi.mock('../src/server/auth/core',()=>({authEnabled:()=>true,hasRole:(u:{role:string})=>u.role!=='viewer'}));
vi.mock('../src/server/ai/ocr',()=>({ocrConfigured:()=>state.configured,recognizeAdPhoto:vi.fn(async()=> 'Продаём квартиры в строящемся доме. Внесите депозит 300 000 ₸.')}));
import {POST} from '../src/app/api/advertisements/ocr/route';
import {recognizeAdPhoto} from '../src/server/ai/ocr';
import {openDatabase} from '../src/server/db/connection';
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks();state.user={id:'u',role:'analyst'};state.configured=true;});
function req(consent='yes',origin='https://site.example') {const form=new FormData();form.append('image',new Blob(['test'],{type:'image/png'}),'ad.png');form.append('consent',consent);return new Request('https://site.example/api/advertisements/ocr',{method:'POST',headers:{origin},body:form});}
it('rejects unauthorized, wrong-origin, non-consenting and oversized requests before AI',async()=>{
 vi.stubEnv('APP_URL','https://site.example');state.user=null;expect((await POST(req())).status).toBe(401);state.user={id:'v',role:'viewer'};expect((await POST(req())).status).toBe(403);state.user={id:'u',role:'analyst'};expect((await POST(req('yes','https://other.example'))).status).toBe(403);expect((await POST(req('no'))).status).toBe(400);
 expect((await POST(new Request('https://site.example/api/advertisements/ocr',{method:'POST',headers:{origin:'https://site.example'},body:'x'.repeat(3200001)}))).status).toBe(413);state.configured=false;expect((await POST(req())).status).toBe(503);expect(recognizeAdPhoto).not.toHaveBeenCalled();
});
it('returns OCR text and enforces a persistent quota',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'ocr-api-'));const path=join(dir,'test.sqlite');
 vi.stubEnv('APP_URL','https://site.example');vi.stubEnv('TURSO_DATABASE_URL','');vi.stubEnv('VERCEL','');vi.stubEnv('DATABASE_PATH',path);
 const db=await openDatabase(path,{create:true});await db.exec('CREATE TABLE auth_throttle(key TEXT PRIMARY KEY,attempts INTEGER,reset_at INTEGER)');
 try{const r=await POST(req());expect(r.status).toBe(200);expect((await r.json()).text).toContain('депозит');expect(r.headers.get('Cache-Control')).toBe('no-store');await db.prepare('UPDATE auth_throttle SET attempts=10 WHERE key=?').run('ad-ocr:u');expect((await POST(req())).status).toBe(429);expect(recognizeAdPhoto).toHaveBeenCalledTimes(1);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

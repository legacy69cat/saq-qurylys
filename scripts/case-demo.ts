import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {openDatabase} from '../src/server/db/connection';
import {migrate} from '../src/server/db/migrations';
import {seedDemo} from '../src/server/db/seed';
import {listProjects} from '../src/server/db/projects';
const live=process.argv.includes('--ai'),verifyOnly=process.argv.includes('--verify');
if(live&&(!process.env.AI_GATEWAY_API_KEY?.trim()||!process.env.AI_GATEWAY_MODEL?.trim()))throw new Error('Live demo requires AI_GATEWAY_API_KEY and AI_GATEWAY_MODEL');
const folder=mkdtempSync(join(tmpdir(),'saq-case-')),path=join(folder,'demo.sqlite');
const db=await openDatabase(path,{create:true});
try{
 await migrate(db);await seedDemo(db);const projects=await listProjects(db);
 const cases=[['demo-a',35,'yellow'],['demo-b',70,'red'],['demo-c',10,'green']] as const;
 if(projects.length<8||projects.reduce((n,p)=>n+p.publications.length,0)<12||projects.some(p=>!p.isDemo||p.latitude===null||p.longitude===null))throw new Error('Incomplete demo dataset');
 for(const [id,score,zone] of cases){const p=projects.find(p=>p.id===id);if(!p||p.risk.score!==score||p.risk.zone!==zone)throw new Error(`Case ${id} failed`);}
 console.log(JSON.stringify({demo:true,projects:projects.length,publications:projects.reduce((n,p)=>n+p.publications.length,0),cases:cases.map(([id,score,zone])=>({id,score,zone})),liveAI:live}));
}catch(e){rmSync(folder,{recursive:true,force:true});throw e;}finally{db.close();}
if(verifyOnly){rmSync(folder,{recursive:true,force:true});process.exit(0);}
const env={...process.env,DATABASE_PATH:path,TURSO_DATABASE_URL:'',TURSO_AUTH_TOKEN:'',VERCEL:'',VERCEL_OIDC_TOKEN:'',APP_ENV:'local',SAQ_AUTH_MODE:'local',SAQ_DEMO_MODE:'1',APP_URL:'http://127.0.0.1:3300',APIFY_TOKEN:'',APIFY_WEBHOOK_SECRET:'',CRON_SECRET:'',TELEGRAM_BOT_TOKEN:'',TELEGRAM_WEBHOOK_SECRET:'',AI_GATEWAY_API_KEY:live?process.env.AI_GATEWAY_API_KEY!:'',AI_GATEWAY_MODEL:live?process.env.AI_GATEWAY_MODEL!:'',DRONE_AI_MODEL:live?process.env.DRONE_AI_MODEL||'':''};
console.log('Isolated demo: http://127.0.0.1:3300 — all objects are fictional. Production database and collection are disconnected.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3300'],{env,stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>child.kill(signal));
child.on('exit',code=>{rmSync(folder,{recursive:true,force:true});process.exitCode=code??0;});

import {timingSafeEqual,randomUUID} from 'node:crypto';
import {databasePath,openDatabase} from '../db/connection';
import {claimWorker,releaseWorker} from '../db/worker-lease';
import {collectTick} from './collector';
import {apifyConfigured} from './apify';
export function validBearer(header:string|null,secret:string|undefined){
 if(!secret||secret.length<32||!header?.startsWith('Bearer '))return false;
 const expected=Buffer.from(secret),actual=Buffer.from(header.slice(7));return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export async function scheduledCollection(){
 if(!apifyConfigured())return Response.json({error:'COLLECTOR_NOT_CONFIGURED'},{status:503});
 const db=await openDatabase(databasePath()),owner=randomUUID();let owned=false;
 try{
  owned=await claimWorker(db,owner);if(!owned)return Response.json({error:'COLLECTOR_BUSY'},{status:503});
  await collectTick(db,undefined,3);return Response.json({status:'ok'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'COLLECTION_FAILED'},{status:503});}
 finally{if(owned)await releaseWorker(db,owner);db.close();}
}

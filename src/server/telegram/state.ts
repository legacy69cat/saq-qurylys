import type {Database} from '../db/connection';
// Reuse the durable TTL key/counter store; never persist message contents or photos.
export async function claimUpdate(db:Database,id:number,chat:number,now=Date.now()):Promise<'claimed'|'done'|'busy'|'limited'>{
 await db.exec('BEGIN IMMEDIATE');
 try{
  await db.prepare("DELETE FROM auth_throttle WHERE key LIKE 'telegram:%' AND reset_at<=? ").run(now-7*86400000);
  const key=`telegram:update:${id}`,row=await db.prepare('SELECT attempts,reset_at FROM auth_throttle WHERE key=?').get(key);
  if(row&&Number(row.attempts)===1){await db.exec('COMMIT');return 'done';}
  if(row&&Number(row.reset_at)>now){await db.exec('COMMIT');return 'busy';}
  for(const [counter,limit,duration] of [[`telegram:chat:${chat}`,10,3600000],['telegram:global',100,86400000]] as const){
   const usage=await db.prepare('SELECT attempts,reset_at FROM auth_throttle WHERE key=?').get(counter);
   if(usage&&Number(usage.reset_at)>now&&Number(usage.attempts)>=limit){await db.prepare('INSERT INTO auth_throttle VALUES(?,0,?) ON CONFLICT(key) DO UPDATE SET attempts=0,reset_at=excluded.reset_at').run(key,now+180000);await db.exec('COMMIT');return 'limited';}
   await db.prepare('INSERT INTO auth_throttle VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').run(counter,now+duration,now,now);
  }
  await db.prepare('INSERT INTO auth_throttle VALUES(?,0,?) ON CONFLICT(key) DO UPDATE SET attempts=0,reset_at=excluded.reset_at').run(key,now+180000);await db.exec('COMMIT');return 'claimed';
 }finally{if(db.isTransaction)await db.exec('ROLLBACK');}
}
export async function finishUpdate(db:Database,id:number){await db.prepare('UPDATE auth_throttle SET attempts=1,reset_at=? WHERE key=?').run(Date.now(),`telegram:update:${id}`);}

import {DatabaseSync} from 'node:sqlite';
import {createClient,type InStatement,type InValue} from '@libsql/client/web';
if(!process.env.TURSO_DATABASE_URL||!process.env.TURSO_AUTH_TOKEN)throw new Error('Turso credentials required');
const local=new DatabaseSync(process.argv[2]||'data/saq.sqlite',{readOnly:true});
const remote=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try{
 const tables=(local.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all() as {name:string}[]).map(x=>x.name).filter(x=>!['schema_migrations','auth_users','auth_sessions','auth_throttle','auth_events','worker_lease','collector_state'].includes(x));
 const tx=await remote.transaction('write');
 try{
  for(const table of tables){const count=await tx.execute(`SELECT COUNT(*) n FROM "${table}"`);if(Number(count.rows[0].n))throw new Error('Destination is not empty; refusing to overwrite');}
  const statements:InStatement[]=[{sql:'PRAGMA defer_foreign_keys=ON',args:[]}];
  let rows=0;
  for(const table of tables){for(const row of local.prepare(`SELECT * FROM "${table}"`).all()){
   const columns=Object.keys(row);statements.push({sql:`INSERT INTO "${table}" (${columns.map(c=>`"${c}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,args:Object.values(row) as InValue[]});rows++;
  }}
  await tx.batch(statements);const violations=await tx.execute('PRAGMA foreign_key_check');if(violations.rows.length)throw new Error('Foreign key check failed');await tx.commit();console.log({tables:tables.length,rows});
 }catch(e){await tx.rollback();throw e;}finally{tx.close();}
}finally{local.close();remote.close();}

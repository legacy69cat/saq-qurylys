import {databasePath,openDatabase} from '../db/connection';
import {saveRegistryCheck} from './service';
export async function refreshRegistries(){
 const db=await openDatabase(databasePath());
 try{
  // Oldest checks first. Six objects per daily tick bounds public-source traffic.
  const rows=await db.prepare(`SELECT p.id,MAX(e.captured_at) AS checked FROM projects p LEFT JOIN evidence e ON e.project_id=p.id AND e.source='Homeportal · автоматический поиск' WHERE p.is_demo=0 GROUP BY p.id HAVING checked IS NULL OR checked<? ORDER BY checked ASC LIMIT 6`).all(new Date(Date.now()-86400000).toISOString());
  const summary={checked:0,unavailable:0,failed:0};
  // Separate connections per task, so write transactions cannot interleave.
  for(let i=0;i<rows.length;i+=2){await Promise.all(rows.slice(i,i+2).map(async row=>{
   const connection=await openDatabase(databasePath());
   try{const check=await saveRegistryCheck(connection,String(row.id),'Автоматическая проверка реестра');summary.checked++;if(check.results.some(r=>r.status==='unavailable')||check.organization.status==='unavailable')summary.unavailable++;}catch{summary.failed++;}finally{connection.close();}
  }));}
  return summary;
 }finally{db.close();}
}

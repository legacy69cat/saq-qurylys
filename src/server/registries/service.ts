import {checkOrganization} from './equrylys';
import {randomUUID} from 'node:crypto';
import type {Database} from '../db/connection';
import {InputError} from '../../domain/analysis';
import {checkHomeportal} from './homeportal';
export async function saveRegistryCheck(db:Database,id:string,actor:string){
  const p=await db.prepare('SELECT p.name,p.is_demo,d.bin FROM projects p JOIN developers d ON d.id=p.developer_id WHERE p.id=?').get(id);
  if(!p||p.is_demo)throw new InputError('Выберите реальный объект.');
  const recent=await db.prepare("SELECT id FROM evidence WHERE project_id=? AND source='Homeportal · автоматический поиск' AND captured_at>? LIMIT 1").get(id,new Date(Date.now()-15*60000).toISOString());
  if(recent)throw new InputError('Проверка уже выполнена за последние 15 минут. Результат находится в сохранённых материалах.');
  const query=/^\d{12}$/.test(String(p.bin))?String(p.bin):String(p.name);
  const [results,organization]=await Promise.all([checkHomeportal(query),checkOrganization(String(p.bin))]);
  const at=new Date().toISOString();
  const text=results.map(r=>`${r.section==='permits'?'Разрешения и гарантии':'Публикации об объектах без разрешений'}\nЗапрос: ${r.query}\nПроверено: ${r.checkedAt}\n${r.message}\nЗаписей: ${r.entries.length} из ${r.total??'неизвестно'}\n`+r.entries.map(e=>`${e.name} · ${e.address} · БИН ${e.bin||'не указан'} · ${e.developer} · ${e.authority}\n${e.url}`).join('\n')).join('\n\n');
  await db.exec("BEGIN IMMEDIATE");
  try {
  await db.prepare("INSERT INTO evidence VALUES (?,?,'legal',?,?,?,?,0)").run(randomUUID(),id,'Homeportal · автоматический поиск','https://homeportal.kz/ru/',text,at);
  await db.prepare("INSERT INTO evidence VALUES (?,?,'legal',?,?,?,?,0)").run(randomUUID(),id,'eQurylys · автоматическая проверка',organization.url,organization.text,at);
  await db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?)').run(randomUUID(),id,actor,'Автоматический поиск в Homeportal',results.map(r=>`${r.section}: ${r.status}, ${r.entries.length}`).join('; ')+`; eQurylys: ${organization.status}`,at);

  await db.exec("COMMIT");
  } catch(error) {await db.exec("ROLLBACK");throw error;}
  return {results,organization};
}

import {describe,it,expect,vi} from 'vitest';
import {parseRegistryPage,searchHomeportal} from '../src/server/registries/homeportal';
const row={id:12,name:'Учебный ЖК',address:'Учебный адрес',bin:'123456789012',developerName:'Учебный застройщик',authority:'Гарантия КЖК'};
const page=(data:unknown[],last_page=1,total=data.length)=>({data:{objects:{data,last_page,total}}});
describe('public Homeportal connector',()=>{
 it('preserves identifiers and uses fixed source links',()=>{expect(parseRegistryPage(page([row]),'permits').entries[0]).toMatchObject({bin:row.bin,name:row.name,url:'https://homeportal.kz/ru/projects/12'});});
 it('reads paginated public searches without following foreign URLs',async()=>{
  const transport=vi.fn().mockResolvedValueOnce(Response.json(page([row],2,2))).mockResolvedValueOnce(Response.json(page([{...row,id:13}],2,2)));
  const r=await searchHomeportal('Учебный','permits',transport);expect(r).toMatchObject({status:'ok',complete:true,total:2});expect(r.entries).toHaveLength(2);expect(transport.mock.calls[1][0]).toBe('https://api.homeportal.kz/api/v1/getobjects?page=2');
 });
 it('distinguishes empty results from errors, never establishes absence',async()=>{
  const empty=await searchHomeportal('Учебный','permits',vi.fn().mockResolvedValue(Response.json(page([]))));expect(empty.status).toBe('ok');expect(empty.message).toContain('не подтверждает');
  for(const response of [Response.json({message:'Unauthenticated'},{status:401}),Response.json({data:[]}),new Response('<html>login</html>')]){const r=await searchHomeportal('Учебный','permits',vi.fn().mockResolvedValue(response));expect(r.status).toBe('unavailable');expect(r.complete).toBe(false);}
 });
 it('reports truncated coverage and bounds requests',async()=>{const transport=vi.fn().mockImplementation(()=>Promise.resolve(Response.json(page([row],10,200))));const r=await searchHomeportal('Учебный','notices',transport);expect(transport).toHaveBeenCalledTimes(3);expect(r.complete).toBe(false);expect(r.message).toContain('первые три');});
 it('rejects invalid entries and unbounded queries',async()=>{expect(()=>parseRegistryPage(page([{...row,id:'../../x'}]),'permits')).toThrow();await expect(searchHomeportal('','permits')).rejects.toThrow();});
});

import {openDatabase} from '../src/server/db/connection';
import {migrate} from '../src/server/db/migrations';
import {addProject} from '../src/server/db/registry';
import {listProjects} from '../src/server/db/projects';
import {saveRegistryCheck} from '../src/server/registries/service';
it('persists source evidence and audit without changing legal status or risk; throttles refresh',async()=>{
 const db=await openDatabase(':memory:');
 try{
  await migrate(db);await addProject(db,{requestId:'real',name:'Учебный объект',address:'Адрес',developer:'Застройщик',stage:'construction',source:'Тест',sourceUrl:'https://example.org',actor:'Тест'});
  vi.stubGlobal('fetch',vi.fn().mockImplementation(()=>Promise.resolve(Response.json(page([row])))));
  await saveRegistryCheck(db,'real','Аналитик');
  const p=(await listProjects(db))[0];expect(p.risk.score).toBe(0);expect(p.legalBasis.status).toBe('unknown');expect(p.evidence.find(e=>e.source==='Homeportal · автоматический поиск')?.text).toContain('https://homeportal.kz/ru/projects/12');
  await expect(saveRegistryCheck(db,'real','Аналитик')).rejects.toThrow('15 минут');
  expect(await db.prepare("SELECT count(*) AS n FROM audit_events WHERE action='Автоматический поиск в Homeportal'").get()).toMatchObject({n:1});
 }finally{vi.unstubAllGlobals();db.close();}
});

import {checkOrganization} from '../src/server/registries/equrylys';
it('checks exact BIN, rejects mismatched response and distinguishes missing BIN from unavailable',async()=>{
 const transport=vi.fn().mockResolvedValue(Response.json({bin:'123456789012',name:'Организация',address:null}));
 expect(await checkOrganization('123456789012',transport)).toMatchObject({status:'ok',url:'https://reestr.equrylys.kz/organization/123456789012'});
 expect(await checkOrganization('unknown',transport)).toMatchObject({status:'missing_bin'});expect(transport).toHaveBeenCalledTimes(1);
 expect(await checkOrganization('123456789013',vi.fn().mockResolvedValue(Response.json({bin:'123456789012',name:'Чужая'})))).toMatchObject({status:'unavailable'});
 const missing=await checkOrganization('123456789012',vi.fn().mockResolvedValue(new Response(null,{status:404})));expect(missing.status).toBe('ok');expect(missing.text).toContain('не подтверждает');
});

import {InputError} from '../../domain/analysis';
export type RegistryEntry={id:string;name:string;address:string;bin:string;developer:string;authority:string;url:string};
export type RegistryResult={section:'permits'|'notices';query:string;checkedAt:string;status:'ok'|'unavailable';entries:RegistryEntry[];total:number|null;complete:boolean;message:string};
const endpoints={permits:'getobjects',notices:'illegal-objects'} as const;
const obj=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v:unknown)=>typeof v==='string'?v.slice(0,1000):'';
export function parseRegistryPage(value:unknown,section:RegistryResult['section']){
 const page=obj(obj(obj(value).data).objects);
 if(!Array.isArray(page.data)||!Number.isInteger(page.last_page)||Number(page.last_page)<1||!Number.isInteger(page.total)||Number(page.total)<0)throw new Error('Registry schema changed');
 const entries=page.data.map((v:unknown)=>{const r=obj(v),id=String(r.id??'');
  const name=str(r.name)||str(r.residential_complex);
  if(!/^\d+$/.test(id)||!name)throw new Error('Invalid registry entry');
  const address=typeof r.address==='string'?str(r.address):str(obj(r.address).ru);
  return {id,name,address,bin:str(r.bin),developer:str(r.developerName)||str(r.developer_name),authority:str(r.authority),url:`https://homeportal.kz/ru/${section==='permits'?'projects':'Illegal-projects'}/${id}`};
 });
 return {entries,total:Number(page.total),lastPage:Number(page.last_page)};
}
export async function searchHomeportal(query:string,section:RegistryResult['section'],transport:typeof fetch=fetch):Promise<RegistryResult>{
 query=query.trim();if(query.length<3||query.length>200)throw new InputError('Введите название или БИН длиной от 3 до 200 символов.');
 const result:RegistryResult={section,query,checkedAt:new Date().toISOString(),status:'ok',entries:[],total:null,complete:false,message:''};
 try{
  // Fixed origin and route: never follow a provider-supplied pagination URL.
  for(let page=1;page<=3;page++){
   const response=await transport(`https://api.homeportal.kz/api/v1/${endpoints[section]}?page=${page}`,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({search:query,is_paginate:true}),signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});
   if(!response.ok)throw new Error(`HTTP ${response.status}`);
   const reader=response.body?.getReader();if(!reader)throw new Error('Empty body');let size=0;const chunks:Uint8Array[]=[];
   try{for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>4_000_000)throw new Error('Response too large');chunks.push(next.value);}}finally{await reader.cancel();}
   const parsed=parseRegistryPage(JSON.parse(Buffer.concat(chunks).toString('utf8')),section);
   result.total=parsed.total;result.entries.push(...parsed.entries);
   if(page>=parsed.lastPage){result.complete=true;break;}
  }
  result.entries=[...new Map(result.entries.map(e=>[e.id,e])).values()];
  result.message=result.entries.length?'Найдены кандидаты. Сверьте адрес, БИН, очередь и документы.':'По этому запросу записей нет. Это не подтверждает отсутствие основания.';
  if(!result.complete)result.message+=' Показаны первые три страницы; уточните запрос.';
 }catch{result.status='unavailable';result.complete=false;result.message='Источник недоступен или изменил формат. Проверка не завершена; предыдущие сведения не отменяются.';}
 return result;
}
export async function checkHomeportal(query:string){return Promise.all([searchHomeportal(query,'permits'),searchHomeportal(query,'notices')]);}

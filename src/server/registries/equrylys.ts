export type OrganizationCheck={status:'ok'|'unavailable'|'missing_bin';text:string;url:string};
export async function checkOrganization(bin:string,transport:typeof fetch=fetch):Promise<OrganizationCheck>{
 const url='https://reestr.equrylys.kz/organizations';
 if(!/^\d{12}$/.test(bin))return {status:'missing_bin',text:'eQurylys: для автоматической проверки организации нужен БИН из 12 цифр.',url};
 try{
  const response=await transport(`https://registry.m10s.equrylys.app/organizations/${bin}`,{headers:{Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.status===404)return {status:'ok',text:`eQurylys: БИН ${bin}. Запись не найдена. Это не подтверждает отсутствие лицензии или разрешения объекта.`,url};
  if(!response.ok)throw new Error('Unavailable');
  const raw=await response.text();if(raw.length>100000)throw new Error('Oversized');
  const row=JSON.parse(raw);
  if(!row||row.bin!==bin||typeof row.name!=='string'||!row.name.trim())throw new Error('Schema mismatch');
  return {status:'ok',url:`https://reestr.equrylys.kz/organization/${bin}`,text:`eQurylys: организация найдена по точному БИН ${bin}.\nНаименование: ${row.name.slice(0,1000)}\nАдрес: ${typeof row.address==='string'?row.address.slice(0,1000):'не указан'}\nНаличие организации в реестре не подтверждает разрешение на привлечение средств для конкретного ЖК.`};
 }catch{return {status:'unavailable',url,text:`eQurylys: проверка БИН ${bin} не завершена — источник недоступен или формат изменён.`};}
}

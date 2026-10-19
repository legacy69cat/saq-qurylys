export const DRONE_ITEMS=[
 {id:'fence',label:'Ограждение площадки',hint:'Периметр и видимые разрывы; высоту и прочность по снимку не подтверждаем.'},
 {id:'waste',label:'Контейнеры для отходов',hint:'Контейнер или бункер; кучи материалов не считаются контейнером.'},
 {id:'entrance',label:'Организованный въезд',hint:'Ворота, шлагбаум или обозначенный въезд.'},
 {id:'board',label:'Информационный щит',hint:'Наличие щита и читаемость; содержание нельзя домысливать.'},
 {id:'hazards',label:'Ограждения опасных участков',hint:'Видимые барьеры у котлованов и мест перепада высоты.'},
] as const;
export type DroneId=typeof DRONE_ITEMS[number]['id'];
export type DroneFinding={id:DroneId;status:'visible'|'unclear';description:string;image:number|null};
export const DRONE_VERSION='drone-1';
export function parseDrone(value:unknown,count:number):DroneFinding[]{
 const rows=(value as {findings?:unknown})?.findings;if(!Array.isArray(rows)||rows.length!==DRONE_ITEMS.length)throw new Error('Некорректный ответ анализа');
 return DRONE_ITEMS.map(item=>{
  const matches=rows.filter(r=>r&&r.id===item.id);if(matches.length!==1)throw new Error('Повтор или пропуск признака');const r=matches[0];
  if(!['visible','unclear'].includes(r.status)||typeof r.description!=='string'||!r.description.trim()||r.description.length>700)throw new Error('Некорректное наблюдение');
  if(r.image!==null&&(!Number.isInteger(r.image)||r.image<1||r.image>count))throw new Error('Снимок не найден');
  if(r.status==='visible'&&r.image===null)throw new Error('Нужна ссылка на снимок');
  return {id:item.id,status:r.status,description:r.description.trim(),image:r.image};
 });
}

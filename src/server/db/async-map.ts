/** Sequential mapping keeps database writes and transaction scopes ordered. */
export async function asyncMap<T,U>(items:readonly T[],fn:(item:T,index:number)=>Promise<U>):Promise<U[]>{const result:U[]=[];for(let i=0;i<items.length;i++)result.push(await fn(items[i],i));return result;}

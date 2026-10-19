import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {createClient,type Client,type Transaction,type InValue} from '@libsql/client/web';
import {existsSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export function databasePath():string {
 if(process.env.TURSO_DATABASE_URL)return process.env.TURSO_DATABASE_URL;
 if(process.env.VERCEL)throw new DatabaseNotReadyError();
 return resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH||'./data/saq.sqlite');
}
export class DatabaseNotReadyError extends Error {constructor(){super('База данных не подготовлена. Настройте подключение и выполните npm run db:setup.');this.name='DatabaseNotReadyError';}}
type Row=Record<string,string|number|bigint|Uint8Array|null>;
export class Database {
 private transaction?:Transaction;
 constructor(public readonly local:DatabaseSync|undefined,private readonly remote?:Client,private readonly readOnly=false){}
 get isTransaction(){return this.local?.isTransaction??Boolean(this.transaction&&!this.transaction.closed);}
 prepare(sql:string){
  const execute=async(args:unknown[])=>{
   if(this.local){const stmt=this.local.prepare(sql);return {stmt,args:args as SQLInputValue[]};}
   if(this.readOnly&&!/^\s*(SELECT|PRAGMA|EXPLAIN)\b/i.test(sql))throw new Error('Read-only database');
   const result=await (this.transaction||this.remote!).execute({sql,args:args as InValue[]});return {result};
  };
  return {
   all:async(...args:unknown[]):Promise<Row[]>=>{const x=await execute(args);return x.stmt?x.stmt.all(...x.args):x.result!.rows as unknown as Row[];},
   get:async(...args:unknown[]):Promise<Row|undefined>=>{const x=await execute(args);return x.stmt?x.stmt.get(...x.args):x.result!.rows[0] as unknown as Row|undefined;},
   run:async(...args:unknown[])=>{const x=await execute(args);return x.stmt?x.stmt.run(...x.args):{changes:x.result!.rowsAffected,lastInsertRowid:x.result!.lastInsertRowid??0n};}
  };
 }
 async exec(sql:string):Promise<void>{
  if(this.local){this.local.exec(sql);return;}
  const command=sql.trim().replace(/;$/,'').toUpperCase();
  if(command.startsWith('BEGIN')){if(this.transaction)throw new Error('Nested transaction');this.transaction=await this.remote!.transaction(this.readOnly?'read':'write');return;}
  if(command==='COMMIT'||command==='ROLLBACK'){
   const tx=this.transaction;if(!tx)throw new Error('No transaction');
   try{if(command==='COMMIT')await tx.commit();else await tx.rollback();}finally{tx.close();this.transaction=undefined;}return;
  }
  if(this.readOnly)throw new Error('Read-only database');
  await (this.transaction||this.remote!).executeMultiple(sql);
 }
 close(){this.transaction?.close();this.remote?.close();this.local?.close();}
}
export async function openDatabase(path:string,options:{create?:boolean;readOnly?:boolean}={}):Promise<Database>{
 if(/^(libsql|https):\/\//.test(path)){
  if(!process.env.TURSO_AUTH_TOKEN)throw new DatabaseNotReadyError();
  return new Database(undefined,createClient({url:path,authToken:process.env.TURSO_AUTH_TOKEN,intMode:'number'}),options.readOnly);
 }
 if(path!==':memory:'){if(options.create)mkdirSync(dirname(path),{recursive:true});else if(!existsSync(path))throw new DatabaseNotReadyError();}
 const raw=new DatabaseSync(path,{readOnly:options.readOnly??false});raw.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');if(!options.readOnly)raw.exec('PRAGMA journal_mode=WAL;');return new Database(raw,undefined,options.readOnly);
}

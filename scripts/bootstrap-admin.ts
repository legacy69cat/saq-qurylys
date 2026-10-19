import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {openDatabase,databasePath} from '../src/server/db/connection';
import {createUser,login,sessionUser,logout} from '../src/server/auth/core';
const output=process.argv[2];if(!output)throw new Error('Private output path required');
const db=await openDatabase(databasePath());
try{
 if(await db.prepare('SELECT id FROM auth_users LIMIT 1').get())throw new Error('User already exists; refusing to replace credentials');
 const password=randomBytes(24).toString('base64url');
 // Write once before creation so credentials are recoverable even if the process stops.
 writeFileSync(output,JSON.stringify({username:'admin',password},null,2),{mode:0o600,flag:'wx'});
 await createUser(db,{username:'admin',name:'Администратор SAQ',role:'admin',password});
 const token=await login(db,'admin',password);if(!(await sessionUser(db,token)))throw new Error('Login verification failed');await logout(db,token);
 console.log('Administrator created; cloud login/logout verified.');
 console.log(await db.prepare('SELECT (SELECT count(*) FROM projects) projects,(SELECT count(*) FROM collected_posts) posts,(SELECT count(*) FROM collection_jobs) jobs').get());
}finally{db.close();}

'use server';
import {authorizeForm} from '@/server/auth/access';
import {databasePath,openDatabase} from '@/server/db/connection';
import {reviewSubmission} from '@/server/telegram/inbox';
import {InputError,required} from '@/domain/analysis';
import {revalidatePath} from 'next/cache';
import type {ActionState} from '@/server/actions';
export async function reviewInboxAction(_:ActionState,form:FormData):Promise<ActionState>{
 await authorizeForm(form);const db=await openDatabase(databasePath());
 try{await reviewSubmission(db,required(form.get('id'),'Обращение'),String(form.get('status')),String(form.get('comment')||''),required(form.get('actor'),'Автор'));revalidatePath('/inbox');return {message:'Решение сохранено.'};}
 catch(e){return {error:e instanceof InputError?e.message:'Не удалось сохранить решение.'};}finally{db.close();}
}

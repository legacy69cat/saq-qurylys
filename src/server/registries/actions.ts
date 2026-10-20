'use server';
import {revalidatePath} from 'next/cache';
import {authorizeForm} from '../auth/access';
import {databasePath,openDatabase} from '../db/connection';
import {required,InputError} from '../../domain/analysis';
import {saveRegistryCheck} from './service';
import type {ActionState} from '../actions';
export async function checkRegistryAction(_:ActionState,form:FormData):Promise<ActionState>{
 await authorizeForm(form);
 const db=await openDatabase(databasePath());
 try{
  const id=required(form.get('projectId'),'Объект',100),actor=required(form.get('actor'),'Автор',200);
  await saveRegistryCheck(db,id,actor);
  revalidatePath(`/projects/${id}`);
  return {message:'Результаты сохранены в материалах объекта. Проверьте совпадения перед изменением правового статуса.'};
 }catch(e){return {error:e instanceof InputError?e.message:'Не удалось сохранить проверку реестра.'};}finally{db.close();}
}

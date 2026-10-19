'use client';
import {useState,type FormEvent} from 'react';
import {buildAdReport,formatAdReport,MAX_AD_LENGTH,type AdReport} from '@/domain/ad-report';
import Link from 'next/link';
import {AdAssessmentCard} from './ad-assessment';
export function AdChecker({ocrEnabled=false}:{ocrEnabled?:boolean}){
 const [text,setText]=useState(''),[evaluated,setEvaluated]=useState(''),[report,setReport]=useState<AdReport|null>(null),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const [file,setFile]=useState<File|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[recognized,setRecognized]=useState(false);
 async function recognize(){
  if(!file||!consent||busy)return;setBusy(true);setError('');setCopied(false);
  try{if(file.size>3_000_000)throw new Error('Скриншот должен быть до 3 МБ.');const form=new FormData();form.append('image',file);form.append('consent','yes');const response=await fetch('/api/advertisements/ocr',{method:'POST',body:form,signal:AbortSignal.timeout(55000)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Распознавание недоступно.');if(typeof result.text!=='string'||result.text.length>MAX_AD_LENGTH)throw new Error('Получен некорректный текст.');if(!result.text.trim())throw new Error('На снимке не найден читаемый текст. Пришлите более чёткий скриншот.');setText(result.text);setReport(null);setRecognized(true);}
  catch(e){setError(e instanceof Error?e.message:'Не удалось распознать снимок.');}finally{setBusy(false);}
 }
 function submit(event:FormEvent){event.preventDefault();setError('');setCopied(false);try{const next=buildAdReport(text);setReport(next);setEvaluated(text);}catch(e){setReport(null);setError(e instanceof Error?e.message:'Не удалось проверить текст.');}}
 async function copy(){try{await navigator.clipboard.writeText(formatAdReport(report!,{source:recognized?'image':'text'}));setCopied(true);setError('');}catch{setError('Не удалось скопировать автоматически. Выделите текст ответа ниже.');}}
 return <>
  <section className="workflow-form" aria-label="Распознавание скриншота"><h2>Из скриншота</h2><label htmlFor="ad-screenshot">Скриншот объявления</label><input id="ad-screenshot" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||!ocrEnabled} onChange={e=>{setFile(e.target.files?.[0]||null);setConsent(false);setError('');}}/><p className="muted">JPEG, PNG или WebP до 3 МБ. Снимок передаётся ИИ только после вашего подтверждения и не сохраняется в базе SAQ. Распознанный текст можно исправить перед оценкой.</p>
  {ocrEnabled?<><label className="checkbox-label"><input type="checkbox" checked={consent} disabled={busy||!file} onChange={e=>setConsent(e.target.checked)}/>Разрешаю передать скриншот ИИ для распознавания</label><button type="button" disabled={busy||!file||!consent} onClick={recognize}>{busy?'Распознаём…':'Распознать текст'}</button></>:<p className="notice">Распознавание недоступно для текущего доступа или не настроено. Проверка текста работает ниже.</p>}
  {busy?<p role="status">Распознаём снимок. Это может занять до минуты.</p>:null}</section>
  {recognized?<p className="notice" role="status">Текст распознан. Проверьте суммы и отрицания, затем нажмите «Проверить текст».</p>:null}

  <form onSubmit={submit} className="workflow-form" aria-label="Проверить текст объявления"><label htmlFor="advertisement-text">Текст объявления</label><textarea id="advertisement-text" name="advertisement" value={text} onChange={e=>{setText(e.target.value);setCopied(false);}} rows={9} disabled={busy} required maxLength={MAX_AD_LENGTH} aria-describedby="text-privacy"/><p id="text-privacy" className="muted">Текст проверяется в браузере и не сохраняется в базе. Вставьте само объявление: одна ссылка не даёт материала для оценки. Скриншот можно распознать выше.</p><button type="submit" disabled={busy}>Проверить текст</button></form>
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {report?<section aria-label="Результат проверки объявления" aria-live="polite">
   {text!==evaluated?<p className="notice">Текст изменён. Нажмите «Проверить текст», чтобы обновить результат.</p>:null}
   <h2>{report.conclusion}</h2><AdAssessmentCard text={evaluated} assessment={report.assessment}/>
   <h3>Полный риск объекта не определён</h3><p>Оценка объявления учитывает только текстовые признаки. Она не подтверждает законность объекта или нарушение и не заменяет проверку документов.</p>
   <details><summary>Каких данных не хватает</summary><ul>{report.missing.map(m=><li key={m.code}><strong>{m.code} · {m.weight} баллов</strong> — {m.description}</li>)}</ul></details><h3>Следующий шаг</h3><p>Уточните БИН застройщика, адрес и очередь ЖК. Сверьте разрешительные документы и сведения об объекте.</p><p><Link href="/sources">Открыть источники для проверки →</Link></p>
   <button type="button" onClick={copy}>Скопировать ответ</button>{copied?<p role="status">Ответ скопирован.</p>:null}
   <details><summary>Текст ответа для отправки</summary><p style={{whiteSpace:'pre-wrap'}}>{formatAdReport(report,{source:recognized?'image':'text'})}</p></details>
  </section>:null}
 </>;
}

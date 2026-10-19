'use client';
import {useState,type FormEvent} from 'react';
import {buildAdReport,formatAdReport,MAX_AD_LENGTH,type AdReport} from '@/domain/ad-report';
import {AdAssessmentCard} from './ad-assessment';
export function AdChecker(){
 const [text,setText]=useState(''),[evaluated,setEvaluated]=useState(''),[report,setReport]=useState<AdReport|null>(null),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 function submit(event:FormEvent){event.preventDefault();setError('');setCopied(false);try{const next=buildAdReport(text);setReport(next);setEvaluated(text);}catch(e){setReport(null);setError(e instanceof Error?e.message:'Не удалось проверить текст.');}}
 async function copy(){try{await navigator.clipboard.writeText(formatAdReport(report!));setCopied(true);setError('');}catch{setError('Не удалось скопировать автоматически. Выделите текст ответа ниже.');}}
 return <>
  <form onSubmit={submit} className="workflow-form" aria-label="Проверить текст объявления"><label htmlFor="advertisement-text">Текст объявления</label><textarea id="advertisement-text" name="advertisement" value={text} onChange={e=>{setText(e.target.value);setCopied(false);}} rows={9} required maxLength={MAX_AD_LENGTH} aria-describedby="text-privacy"/><p id="text-privacy" className="muted">Текст проверяется в браузере и не сохраняется в базе. Вставьте само объявление: одна ссылка, фото или видео не дают материала для текстовой оценки.</p><button type="submit">Проверить текст</button></form>
  {error?<p role="alert" className="form-error">{error}</p>:null}
  {report?<section aria-label="Результат проверки объявления" aria-live="polite">
   {text!==evaluated?<p className="notice">Текст изменён. Нажмите «Проверить текст», чтобы обновить результат.</p>:null}
   <h2>{report.conclusion}</h2><AdAssessmentCard text={evaluated} assessment={report.assessment}/>
   <h3>Полный риск объекта не определён</h3><p>Оценка объявления учитывает только текстовые признаки. Она не подтверждает законность объекта или нарушение и не заменяет проверку документов.</p>
   <ul>{report.missing.map(m=><li key={m.code}><strong>{m.code} · {m.weight} баллов</strong> — {m.description}</li>)}</ul>
   <button type="button" onClick={copy}>Скопировать ответ</button>{copied?<p role="status">Ответ скопирован.</p>:null}
   <details><summary>Текст ответа для отправки</summary><p style={{whiteSpace:'pre-wrap'}}>{formatAdReport(report)}</p></details>
  </section>:null}
 </>;
}

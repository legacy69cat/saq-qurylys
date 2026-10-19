import {assessAd, type AdAssessment} from './ad-scoring';
import {FACTOR_RULES} from './risk';
export const AD_REPORT_VERSION='ad-report-2';
export const MAX_AD_LENGTH=20000;
export type AdReport={
 version:string; assessedAt:string; assessment:AdAssessment;
 conclusion:string; fullRisk:null;
 missing:{code:string;weight:number;description:string}[];
};
export function buildAdReport(text:string,now=Date.now()):AdReport{
 if(!text.trim())throw new Error('Вставьте текст объявления.');
 if(text.length>MAX_AD_LENGTH)throw new Error(`Объявление должно содержать не больше ${MAX_AD_LENGTH} символов.`);
 const onlyLinks=!text.replace(/https?:\/\/\S+/giu,'').trim();
 const assessment=assessAd(onlyLinks?'':text,{now});
 const conclusion=assessment.category==='insufficient'?'Для оценки недостаточно текста.':assessment.signals.length?'В тексте есть признаки для проверки.':assessment.category==='review'?'Условия объявления требуют ручной проверки.':'Явные признаки R2/R3 в тексте не найдены. Это не подтверждает безопасность предложения.';
 return {version:AD_REPORT_VERSION,assessedAt:new Date(now).toISOString(),assessment,conclusion,fullRisk:null,missing:[
  {code:'R1',weight:FACTOR_RULES.R1.weight,description:'Результат проверки правового основания привлечения средств по применимым реестрам.'},
  {code:'R4',weight:FACTOR_RULES.R4.weight,description:'Подтверждённые сведения о жалобах.'},
  {code:'R5',weight:FACTOR_RULES.R5.weight,description:'Датированные сведения о плановом и фактическом ходе строительства.'},
  {code:'R6',weight:FACTOR_RULES.R6.weight,description:'Документы о сроках и задержке ввода объекта.'},
 ]};
}
/** Shared, bounded plain-text result for web and Telegram. */
export function formatAdReport(report:AdReport,options:{source?:'text'|'image'}={}):string{
 const a=report.assessment;
 return [
  'Проверка объявления', report.conclusion,
  a.category==='insufficient'?'Оценка по тексту: недостаточно данных.':`Предварительные баллы: ${a.score}. Проверены только текстовые признаки R2/R3 (максимум 35), а не весь риск объекта.`,
  ...a.signals.map(s=>`${s.code==='R2'?'Предложение внести деньги':'Признаки строительства'} · +${s.points} (${s.code})\n«${s.quote.slice(0,300)}»${s.quote.length>300?' (фрагмент)':''}`),
  'Полный риск объекта: не определён. Разрешения, жалобы, ход строительства и сроки ещё не проверены.',
  'Что проверить дальше:\n1. Уточните БИН застройщика, адрес и очередь ЖК.\n2. Сверьте разрешение или гарантию и реквизиты объекта: https://homeportal.kz\n3. Передайте документы аналитику для проверки остальных факторов.',
  '0 баллов не означает отсутствие риска. Баллы не являются вероятностью нарушения.',
  options.source==='image'?'Источник: распознанный текст снимка. ИИ мог ошибиться — сверьте суммы и отрицания.':'Источник: присланный текст. Изображения, видео и речь не анализировались.',
  `Дата: ${report.assessedAt.slice(0,10)} · правила ${a.version}.`,
 ].join('\n\n');
}

import {assessAd, type AdAssessment} from './ad-scoring';
import {FACTOR_RULES} from './risk';
export const AD_REPORT_VERSION='ad-report-1';
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
/** Plain text, suitable for Telegram without parse_mode. No public endpoint or bot dependency. */
export function formatAdReport(report:AdReport):string{
 const a=report.assessment;
 return [
  'Предварительная проверка объявления',report.conclusion,
  a.category==='insufficient'?'Оценка по тексту: недостаточно данных.':`Признаки по тексту: ${a.score} из 35 возможных баллов R2/R3.`,
  'Полный риск объекта: не определён. Это не вероятность нарушения.',
  ...a.signals.map(s=>`${s.code}: +${s.points}\nЦитата: «${s.quote.slice(0,400)}»${s.quote.length>400?' (фрагмент)':''}\n${s.reason}`),
  ...a.reasons,
  'Не проверено:',...report.missing.map(m=>`${m.code} (${m.weight} баллов): ${m.description}`),
  '0 баллов не означает отсутствие риска. Изображения, видео и речь не анализировались. Текстовые признаки требуют подтверждения аналитиком.',
  `Версия правил: ${a.version}. Дата оценки: ${report.assessedAt.slice(0,10)}.`,
 ].join('\n\n');
}

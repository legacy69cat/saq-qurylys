import {buildAdReport,formatAdReport} from '../../domain/ad-report';
import {recognizeAdPhoto} from '../ai/ocr';
export const BOT_HELP='SAQ — предварительная проверка рекламы жилья.\n\nОтправьте текст объявления или один скриншот как фото. Бот покажет признаки и баллы R2/R3 по тем же правилам, что сайт. Ссылки автоматически не открываются; видео и документы пока не поддерживаются.\n\nСкриншот передаётся в ИИ для распознавания текста. Не отправляйте документы, пароли и личные данные. Текст и снимки не сохраняются в базе SAQ; Telegram и провайдер ИИ обрабатывают их по своим условиям.\n\nЭто не проверка разрешений и не заключение о нарушении. Полный риск требует проверки реестров и документов. 0 баллов не подтверждает безопасность.\n\nДо 10 запросов в час. /help — помощь, /privacy — обработка данных.';
export function textReport(text:string){return formatAdReport(buildAdReport(text));}
export async function photoReport(bytes:Uint8Array,caption=''){
 const text=await recognizeAdPhoto(bytes);
 if(!text.trim())return 'На снимке не удалось прочитать объявление. Пришлите более чёткий скриншот или вставьте текст. Скоринг не выполнен.';
 const report=formatAdReport(buildAdReport([text,caption].filter(Boolean).join('\n')),{source:'image'});
 return `Текст со снимка (ИИ мог ошибиться — проверьте суммы и отрицания):\n${text.slice(0,1800)}${text.length>1800?'\n[показан фрагмент]':''}\n\n${report}`;
}

import {buildAdReport,formatAdReport} from '../../domain/ad-report';
import {recognizeAdPhoto} from '../ai/ocr';
export const BOT_HELP='Отправьте текст объявления или скриншот как фото. Вы получите предварительную оценку и номер обращения.\n\nДля ссылки добавьте текст объявления. Видео и документы пока не поддерживаются.\n\nОбъявление сохраняется для проверки. /privacy — обработка данных.';
export const BOT_PRIVACY='Текст объявления и распознанный текст снимка сохраняются в SAQ для проверки. Сам снимок в базе SAQ не хранится. Для распознавания фото передаётся сервису ИИ. Telegram обрабатывает сообщения по своим условиям.\n\nНе отправляйте документы, пароли и лишние личные данные.';
export function textReport(text:string){return formatAdReport(buildAdReport(text));}
export async function photoReport(bytes:Uint8Array,caption='',onText?:(text:string)=>Promise<void>){
 const text=await recognizeAdPhoto(bytes);
 if(!text.trim())return 'На снимке не удалось прочитать объявление. Пришлите более чёткий скриншот или вставьте текст. Скоринг не выполнен.';
 if(onText)await onText([text,caption].filter(Boolean).join('\n'));
 const report=formatAdReport(buildAdReport([text,caption].filter(Boolean).join('\n')),{source:'image'});
 return `Текст со снимка (ИИ мог ошибиться — проверьте суммы и отрицания):\n${text.slice(0,1800)}${text.length>1800?'\n[показан фрагмент]':''}\n\n${report}`;
}

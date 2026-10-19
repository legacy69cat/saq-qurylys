import { FACTOR_RULES } from './risk';
export const AD_RULES_VERSION = 'ads-1.1';
export type AdSignal = {
    code: 'R2' | 'R3';
    points: number;
    quote: string;
    reason: string;
};
export type AdAssessment = {
    version: string;
    score: number;
    signals: AdSignal[];
    category: 'candidate' | 'housing' | 'other' | 'insufficient' | 'review';
    reasons: string[];
    warnings: string[];
};
const attention = /брон|депозит|задат|предоплат|рассроч|взнос|первоначальн|предварительн.{0,20}договор|долев|котлован|жарна|брондау|бөліп\s+төле|алдын\s+ала\s+төлем/iu;
const housing = /квартир|жил(?:ой|ого|ом|ые)\s+(?:комплекс|дом)|(?:^|\s)жк(?:\s|[«“"]|$)|пәтер|тұрғын\s*үй|новострой/iu;
const construction = /строящ|строится|на\s+(?:этапе|стадии)\s+(?:котлована|строительства)|до\s+(?:ввода|сдачи)\s+(?:дома|объекта)|сдача\s+(?:дома\s+)?(?:в\s+)?20\d{2}|салынып\s+жатқан|құрылыс\s+кезең/iu;
const offer = /прода[её]тся|прода[её]м|продаж|купите|покупайте|забронируйте|предлагаем|квартир.{0,45}от\s+застройщика|пәтер.{0,25}сатылады|сатып\s+алыңыз|брондаңыз/iu;
const payment = /(?:внесите|вносите|оплатите|перечислите|переведите|принимаем|внести|оплатить|забронируйте).{0,70}(?:депозит|задаток|предоплат|взнос|брон|₸|тенге)|(?:депозит|задаток|предоплата|первоначальный\s+взнос|платная\s+бронь|бронь|бронирование|первый\s+взнос|первоначалка)\s*(?:за\s+квартиру\s*)?[:—–-]?\s*(?:от\s+)?\d[\d\s.,]*(?:₸|тенге|тг|%|тыс|млн)|(?:алғашқы|бастапқы)\s+жарна\s*[:—–-]?\s*\d[\d\s.,]*(?:₸|теңге|%)|(?:төлеңіз|аударыңыз).{0,50}(?:теңге|₸)|(?:депозит|алдын\s+ала\s+төлем).{0,40}(?:төлеңіз|аударыңыз)/iu;
const negated = /\bnever\b|(?:^|\s)не\s+(?:надо|нужно|требуется|вносите|внести|платите|оплачивайте|переводите)|без\s+(?:депозит|задат|предоплат|первоначальн|взнос)|бесплатн|(?:депозит|взнос|предоплат|бронь).{0,18}не\s+треб|(?:депозит|взнос|предоплата|бронь)\s*[:—-]?\s*0\s*(?:₸|тенге|тг|%)|жарнасыз|төлемсіз|төлемеңіз|аудармаңыз/iu;
const unrelated = /аренд|сда[её]тся|посуточ|жалға|ваканси|требуется\s+(?:строитель|рабочий)|жұмысқа/iu;
const news = /президент|токаев|поручил|заявил|новости|сообщает|мошенник|не\s+попадитесь|остерегайтесь|алаяқ/iu;
const completed = /вторичн|заезжай\s+и\s+живи|(?:дом|объект)\s+(?:уже\s+)?(?:сдан|введ[её]н)|(?:дом|постройки)\s+(?:19|20)\d{2}\s+года|пайдалануға\s+берілген/iu;
const excerpt = (text: string, pattern: RegExp) => { const index = text.search(pattern); const start = Math.max(0, index - 150); return text.slice(start, start + 1500); };
/** Transparent text rules; never a legal conclusion or a confirmed project factor. */
export function assessAd(text: string, meta: {
    publishedAt?: string | null;
    truncated?: boolean;
    now?: number;
} = {}): AdAssessment {
    const result: AdAssessment = { version: AD_RULES_VERSION, score: 0, signals: [], category: 'insufficient', reasons: [], warnings: [] };
    const body = text.replace(/#[\p{L}\p{N}_]+/gu, '');
    if (!meta.publishedAt)
        result.warnings.push('Дата публикации неизвестна');
    else if (Number.isFinite(Date.parse(meta.publishedAt)) && (meta.now ?? Date.now()) - Date.parse(meta.publishedAt) > 180 * 86400000)
        result.warnings.push('Публикация старше 180 дней — проверьте актуальность');
    if (meta.truncated)
        result.warnings.push('Текст сокращён источником');
    if (body.replace(/[^\p{L}]/gu, '').length < 12) {
        result.reasons.push('Недостаточно содержательного текста; хештеги не подтверждают факторы');
        return result;
    }
    if (!housing.test(body)) {
        result.category = 'other';
        result.reasons.push('Предложение жилья в тексте не установлено');
        return result;
    }
    if (unrelated.test(body) || news.test(body)) {
        result.category = offer.test(body) && attention.test(body) ? 'review' : 'other';
        result.reasons.push('Смешанный контекст: аренда, новость или предупреждение. Автоматические баллы не начислены; проверьте смысл объявления.');
        return result;
    }
    result.category = 'housing';
    const chunks = text.match(/[^.!?\n]+[.!?]?/gu)?.map(s => s.trim()).filter(Boolean) ?? [];
    const paymentQuote = chunks.find(s => payment.test(s.replace(/#[\p{L}\p{N}_]+/gu, '')) && !negated.test(s));
    const buildingQuote = chunks.find(s => construction.test(s.replace(/#[\p{L}\p{N}_]+/gu, '')) && !/(?:не\s+строится|не\s+строящ)/iu.test(s));
    const complete = completed.test(body);
    if (complete) {
        result.reasons.push('Есть признаки готового или вторичного жилья; стадия требует сверки');
    }
    else {
        if (paymentQuote)
            result.signals.push({ code: 'R2', points: FACTOR_RULES.R2.weight, quote: excerpt(paymentQuote, payment), reason: 'Есть прямое предложение оплаты или условие взноса с суммой. Проверьте получателя и связь с объектом.' });
        if (buildingQuote && (offer.test(body) || !!paymentQuote))
            result.signals.push({ code: 'R3', points: FACTOR_RULES.R3.weight, quote: excerpt(buildingQuote, construction), reason: 'Есть предложение приобретения жилья и явное указание на строительство. Проверьте стадию объекта.' });
    }
    result.score = result.signals.reduce((sum, s) => sum + s.points, 0);
    if (result.signals.length)
        result.category = 'candidate';
    if (!buildingQuote && !complete)
        result.warnings.push('Стадия строительства из текста не установлена');
    if (!result.signals.length && attention.test(body) && !complete) {
        result.category = 'review';
        result.reasons.push('Есть условия оплаты, бронирования или договора, но оснований для автоматической гипотезы недостаточно. Нужна проверка оригинала.');
    }
    if (!result.signals.length)
        result.reasons.push('Явных оснований для гипотез R2/R3 по текстовым правилам нет');
    result.warnings.push('R1, R4–R6 требуют отдельной проверки документов; из объявления не начисляются');
    return result;
}

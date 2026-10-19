export class InputError extends Error {
}
export interface Suggestion {
    code: "R2" | "R3";
    quote: string;
    explanation: string;
    confidence: number;
}
export interface Analysis {
    summary: string;
    suggestions: Suggestion[];
}
export function required(value: unknown, label: string, max = 200): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max)
        throw new InputError(`${label}: заполните поле (до ${max} символов).`);
    return value.trim();
}
export function httpUrl(value: unknown): string {
    const text = required(value, "Ссылка", 2000);
    let url: URL;
    try {
        url = new URL(text);
    }
    catch {
        throw new InputError("Укажите полную ссылку http:// или https://.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new InputError("Допустима только HTTP(S)-ссылка без пароля.");
    return url.href;
}
export function isoDate(value: unknown): string {
    const text = required(value, "Дата", 50);
    if (!/^\d{4}-\d{2}-\d{2}(T.*(?:Z|[+-]\d{2}:\d{2}))?$/.test(text) || !Number.isFinite(Date.parse(text)))
        throw new InputError("Укажите корректную дату; для времени нужен часовой пояс.");
    const date = new Date(text);
    if (date.toISOString().slice(0, 10) !== text.slice(0, 10) && text.length === 10)
        throw new InputError("Некорректная дата.");
    if (date.getTime() > Date.now())
        throw new InputError("Дата не может быть в будущем.");
    return date.toISOString();
}
export function parseAnalysis(value: unknown, text: string): Analysis {
    if (!value || typeof value !== "object")
        throw new InputError("ИИ вернул некорректный результат.");
    const data = value as Record<string, unknown>;
    const summary = required(data.summary, "Описание анализа", 1500);
    if (!Array.isArray(data.suggestions) || data.suggestions.length > 2)
        throw new InputError("Некорректный список гипотез.");
    const codes = new Set<string>();
    const suggestions = data.suggestions.map((item: unknown): Suggestion => {
        if (!item || typeof item !== "object")
            throw new InputError("Некорректная гипотеза.");
        const row = item as Record<string, unknown>;
        if ((row.code !== "R2" && row.code !== "R3") || codes.has(row.code))
            throw new InputError("Допустимы только уникальные гипотезы R2/R3.");
        codes.add(row.code);
        const quote = required(row.quote, "Цитата", 2000);
        if (!text.includes(quote))
            throw new InputError("Цитата отсутствует в исходном тексте. Результат не сохранён; проверьте публикацию вручную.");
        if (typeof row.confidence !== "number" || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1)
            throw new InputError("Некорректная уверенность ИИ.");
        return { code: row.code, quote, confidence: row.confidence, explanation: required(row.explanation, "Объяснение", 1500) };
    });
    return { summary, suggestions };
}

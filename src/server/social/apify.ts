import { InputError } from "../../domain/analysis";
import { ACTORS, actorInput, type SearchInput, type Platform } from "../../domain/social";
export const runBudget = (platform: Platform) => platform === "tiktok" ? 0.5 : 0.2;
export const DAILY_BUDGET_USD = 1;
export type RemoteRun = {
    id: string;
    status: string;
    defaultDatasetId: string;
    usageTotalUsd?: number;
};
export class ApifyError extends InputError {
    constructor(message: string, public readonly uncertain = false) { super(message); }
}
export function apifyConfigured() { return Boolean(process.env.APIFY_TOKEN?.trim()); }
export class ApifyClient {
    constructor(private readonly token = process.env.APIFY_TOKEN || "", private readonly transport: typeof fetch = fetch) { }
    private async request(path: string, body?: unknown): Promise<unknown> {
        if (!this.token.trim())
            throw new ApifyError("Добавьте APIFY_TOKEN в .env.local и перезапустите сборщик.");
        let response: Response;
        try {
            response = await this.transport(`https://api.apify.com/v2/${path}`, {
                method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
                body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store",
            });
        }
        catch {
            throw new ApifyError("Нет ответа Apify. Проверьте запуск в Apify Console; автоматический повтор платного запроса отключён.", body !== undefined);
        }
        if (!response.ok) {
            const detail = await response.json().catch(() => null) as {
                error?: {
                    type?: unknown;
                    message?: unknown;
                };
            } | null;
            const code = typeof detail?.error?.type === "string" && /^[a-z0-9-]{1,100}$/.test(detail.error.type) ? detail.error.type : "unknown";
            const hint = code === "max-total-charge-usd-below-minimum" ? "Минимальная стоимость сборщика выше установленного лимита запуска." : "";
            throw new ApifyError(`Apify: HTTP ${response.status} (${code}). ${hint} ${response.status === 401 || response.status === 403 ? "Проверьте токен и права доступа." : response.status === 402 ? "Проверьте баланс Apify." : "Проверьте доступность сборщика в Apify Console."}`, body !== undefined && response.status >= 500);
        }
        try {
            return await response.json();
        }
        catch {
            throw new ApifyError("Apify вернул некорректный ответ.", body !== undefined);
        }
    }
    private run(value: unknown): RemoteRun {
        const data = (value as {
            data?: RemoteRun;
        })?.data;
        if (!data || !/^[a-zA-Z0-9]+$/.test(data.id) || typeof data.status !== "string" || typeof data.defaultDatasetId !== "string")
            throw new ApifyError("Не удалось прочитать идентификатор запуска Apify.", true);
        return data;
    }
    async start(search: SearchInput): Promise<RemoteRun> {
        const callback=process.env.APP_URL, secret=process.env.APIFY_WEBHOOK_SECRET;
        let hooks='';
        if(callback&&secret){
            const url=new URL('/api/webhooks/apify',callback);if(url.protocol!=='https:')throw new ApifyError('APP_URL must use HTTPS');
            hooks='&webhooks='+encodeURIComponent(Buffer.from(JSON.stringify([{eventTypes:['ACTOR.RUN.SUCCEEDED','ACTOR.RUN.FAILED','ACTOR.RUN.ABORTED','ACTOR.RUN.TIMED_OUT'],requestUrl:url.toString(),headersTemplate:JSON.stringify({Authorization:`Bearer ${secret}`})}])).toString('base64'));
        }
        return this.run(await this.request(`acts/${ACTORS[search.platform]}/runs?timeout=300&maxTotalChargeUsd=${runBudget(search.platform)}&restartOnError=false${hooks}`, actorInput(search)));
    }
    async poll(id: string): Promise<RemoteRun> { return this.run(await this.request(`actor-runs/${encodeURIComponent(id)}`)); }
    async items(datasetId: string, limit: number): Promise<unknown[]> {
        const items = await this.request(`datasets/${encodeURIComponent(datasetId)}/items?format=json&clean=true&limit=${limit}`);
        if (!Array.isArray(items))
            throw new ApifyError("Apify вернул некорректный набор данных.");
        return items.slice(0, limit);
    }
}

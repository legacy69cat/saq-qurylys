import { searchQueries, splitTerms } from "./search-packs";
import { InputError, required } from "./analysis";
export const PLATFORMS = { tiktok: "TikTok", facebook: "Facebook", instagram: "Instagram" } as const;
export type Platform = keyof typeof PLATFORMS;
export type SearchInput = {
    city: string;
    keywords: string;
    platform: Platform;
    resultLimit: number;
    intervalHours: number;
};
export function parseSearch(data: Record<string, unknown>): SearchInput {
    const city = required(data.city, "Город", 80);
    const keywords = required(data.keywords, "Поисковые фразы", 1000);
    if (/[\n,]/.test(city + keywords))
        throw new InputError("Разделяйте фразы символом |, без запятых и переносов строк.");
    const terms = splitTerms(keywords);
    if (!terms.length || terms.length > 8 || terms.some(t => t.length > 120) || new Set(terms.map(t => t.toLocaleLowerCase())).size !== terms.length)
        throw new InputError("Укажите от 1 до 8 разных фраз, до 120 символов каждая.");
    const platform = String(data.platform);
    if (!Object.hasOwn(PLATFORMS, platform))
        throw new InputError("Выберите площадку.");
    const resultLimit = Number(data.resultLimit), intervalHours = Number(data.intervalHours);
    if (!Number.isInteger(resultLimit) || resultLimit < terms.length || resultLimit > 50)
        throw new InputError("Лимит: не меньше числа фраз и не больше 50 результатов.");
    if (![6, 12, 24, 48, 168].includes(intervalHours))
        throw new InputError("Выберите периодичность.");
    return { city, keywords, platform: platform as Platform, resultLimit, intervalHours };
}
export const ACTORS: Record<Platform, string> = { tiktok: "clockworks~tiktok-scraper", instagram: "apify~instagram-search-scraper", facebook: "coregent~facebook-search-scraper" };
export function actorInput(search: SearchInput) {
    const queries = searchQueries(search.city, search.keywords);
    const perQuery = Math.max(1, Math.floor(search.resultLimit / queries.length));
    switch (search.platform) {
        case "tiktok": return { searchQueries: queries, searchSection: "/video", resultsPerPage: perQuery, shouldDownloadVideos: false, shouldDownloadCovers: false };
        case "instagram": return { search: queries.map(query => query.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim()).join(","), searchType: "popular", searchLimit: perQuery, enhanceUserSearchWithFacebookPage: false };
        case "facebook": return { queries, searchType: "posts", maxResults: perQuery };
    }
}
export type CollectedPost = {
    externalId: string;
    url: string;
    text: string;
    account: string;
    publishedAt: string | null;
    truncated: boolean;
};
function str(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export function normalizePost(platform: Platform, value: unknown): CollectedPost | null {
    const row = record(value);
    if (row.error || row.errorDescription)
        return null;
    const rawUrl = platform === "tiktok" ? row.webVideoUrl : platform === "facebook" ? row.postUrl || row.url : row.url;
    let url: URL;
    try {
        url = new URL(str(rawUrl));
    }
    catch {
        return null;
    }
    const domain = `${platform}.com`;
    if (url.protocol !== "https:" || url.username || url.password || url.port || !(url.hostname === domain || url.hostname.endsWith(`.${domain}`)))
        return null;
    // Do not accept profiles, search pages or provider error records as publications.
    if (platform === "tiktok" && !/\/video\/\d+/.test(url.pathname))
        return null;
    if (platform === "instagram" && !/^\/(p|reel|reels)\/[^/]+/.test(url.pathname))
        return null;
    if (platform === "facebook" && !/\/(posts|videos|reel|permalink)\/|\/(story|permalink)\.php/.test(url.pathname))
        return null;
    const identity = platform === "tiktok" ? url.pathname.match(/\/video\/(\d+)/)?.[1] : platform === "instagram" ? url.pathname.split("/")[2] : str(row.id) || url.searchParams.get("story_fbid") || url.pathname.replace(/\/$/, "");
    if (!identity)
        return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
        if (!['id', 'story_fbid'].includes(key))
            url.searchParams.delete(key);
    const text = str(platform === "instagram" ? row.caption : row.text).slice(0, 30000);
    const account = str(platform === "tiktok" ? record(row.authorMeta).name : platform === "instagram" ? row.ownerUsername : row.authorName).slice(0, 300);
    const date = platform === "tiktok" ? row.createTimeISO : platform === "instagram" ? row.timestamp : row.createdAt;
    const time = typeof date === "string" && /^\d{4}-\d{2}-\d{2}T/.test(date) ? Date.parse(date) : NaN;
    return { externalId: identity, url: url.href, text, account, publishedAt: Number.isFinite(time) && time <= Date.now() ? new Date(time).toISOString() : null, truncated: row.textTruncated === true || str(row.text || row.caption).length > 30000 };
}

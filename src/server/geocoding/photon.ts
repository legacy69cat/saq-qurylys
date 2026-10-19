import { createHash, randomUUID } from 'node:crypto';
import type {Database as DatabaseSync} from '../db/connection';
import { normalizeAddress } from "../../domain/addresses";
import { InputError, required } from '../../domain/analysis';
export interface GeoCandidate {
    latitude: number;
    longitude: number;
    label: string;
    house: string;
    street: string;
    city: string;
    url: string;
    precise: boolean;
}
export function parsePhoton(value: unknown): GeoCandidate[] {
    if (!value || typeof value !== 'object' || !Array.isArray((value as {
        features?: unknown;
    }).features))
        throw new InputError('Сервис координат вернул некорректный ответ.');
    const results: GeoCandidate[] = [];
    for (const f of (value as {
        features: unknown[];
    }).features.slice(0, 10)) {
        if (!f || typeof f !== 'object')
            continue;
        const feature = f as {
            geometry?: {
                type?: unknown;
                coordinates?: unknown[];
            };
            properties?: Record<string, unknown>;
        };
        const p = feature.properties, coords = feature.geometry?.coordinates;
        if (!p || feature.geometry?.type !== 'Point' || !Array.isArray(coords) || String(p.countrycode).toUpperCase() !== 'KZ')
            continue;
        const [lon, lat] = coords;
        if (typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat) || lat < 40 || lat > 56 || lon < 46 || lon > 88)
            continue;
        const field = (key: string) => typeof p[key] === 'string' ? String(p[key]).slice(0, 250) : '';
        const house = field('housenumber'), street = field('street'), city = field('city') || field('locality');
        const type = { N: 'node', W: 'way', R: 'relation' }[String(p.osm_type) as 'N' | 'W' | 'R'];
        const id = String(p.osm_id);
        if (!type || !/^\d+$/.test(id))
            continue;
        results.push({ latitude: lat, longitude: lon, label: [field('name'), street, house, city, field('state')].filter(Boolean).join(', '), house, street, city, url: `https://www.openstreetmap.org/${type}/${id}`, precise: !!house && !!street });
    }
    return results.slice(0, 5);
}
export async function searchLocation(db: DatabaseSync, postId: string, addressInput: unknown, cityInput: unknown, transport: typeof fetch = fetch) {
    const address = required(addressInput, 'Улица и номер дома', 200), city = required(cityInput, 'Город', 100);
    if (!/\d/.test(address))
        throw new InputError('Укажите номер дома. Центр улицы не подходит для отметки объекта.');
    if (!(await db.prepare('SELECT id FROM collected_posts WHERE id=?').get(postId)))
        throw new InputError('Публикация не найдена.');
    const endpoint = process.env.PHOTON_API_URL || 'https://photon.komoot.io/api/';
    const url = new URL(endpoint);
    if (url.protocol !== 'https:')
        throw new InputError('Адрес сервиса координат должен использовать HTTPS.');
    url.searchParams.set('q', `${address}, ${city}, Казахстан`);
    url.searchParams.set('countrycode', 'KZ');
    url.searchParams.set('limit', '5');
    const key = createHash('sha256').update(url.href).digest('hex');
    const cached = (await db.prepare('SELECT results FROM geocode_cache WHERE query=? AND captured_at>?').get(key, new Date(Date.now() - 30 * 86400000).toISOString()));
    let results: GeoCandidate[];
    if (cached)
        results = JSON.parse(String(cached.results));
    else {
        const time = Date.now(), day = new Date(time).toISOString().slice(0, 10);
        (await db.exec('BEGIN IMMEDIATE'));
        try {
            const state = (await db.prepare('SELECT * FROM geocoder_state WHERE id=1').get()) as {
                last_request: number;
                day: string;
                calls: number;
            } | undefined;
            if (state && time - state.last_request < 1500)
                throw new InputError('Подождите две секунды перед следующим поиском.');
            if (state?.day === day && state.calls >= 50)
                throw new InputError('Достигнут локальный лимит: 50 поисков координат в сутки. Используйте ручной ввод.');
            (await db.prepare('INSERT INTO geocoder_state VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET last_request=excluded.last_request,day=excluded.day,calls=excluded.calls').run(time, day, state?.day === day ? state.calls + 1 : 1));
            (await db.exec('COMMIT'));
        }
        catch (e) {
            (await db.exec('ROLLBACK'));
            throw e;
        }
        let response: Response;
        try {
            response = await transport(url, { headers: { 'User-Agent': 'SAQ-Qurylys/1.0 (https://github.com/legacy69cat/saq-qurylys)', 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
        }
        catch {
            throw new InputError('Сервис координат недоступен. Повторите позже или укажите координаты вручную.');
        }
        if (!response.ok)
            throw new InputError(`Сервис координат: HTTP ${response.status}. Повторите позже или используйте ручной ввод.`);
        let json: unknown;
        try {
            const body = await response.text();
            if (body.length > 200000)
                throw new Error();
            json = JSON.parse(body);
        }
        catch {
            throw new InputError('Некорректный ответ сервиса координат.');
        }
        const house = address.match(/(\d{1,4}[а-яa-z]?(?:[/-]\d{1,3})?)\s*$/iu)?.[1];
        results = parsePhoton(json).map(c => ({ ...c, precise: c.precise && !!house && normalizeAddress(c.house) === normalizeAddress(house) && normalizeAddress(c.city) === normalizeAddress(city) }));
        (await db.prepare('INSERT INTO geocode_cache VALUES(?,?,?) ON CONFLICT(query) DO UPDATE SET results=excluded.results,captured_at=excluded.captured_at').run(key, JSON.stringify(results), new Date().toISOString()));
    }
    const id = randomUUID();
    (await db.prepare('INSERT INTO location_searches VALUES(?,?,?,?,?,?)').run(id, postId, address, city, JSON.stringify(results), new Date().toISOString()));
    return id;
}

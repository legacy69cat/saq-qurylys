import type {Database as DatabaseSync} from './connection';
import { randomUUID } from 'node:crypto';
import { InputError, required, httpUrl, isoDate } from '../../domain/analysis';
import { distanceMeters, normalizeAddress } from '../../domain/addresses';
import type { GeoCandidate } from '../geocoding/photon';
import { addProject, linkCollectedPost } from './registry';
export interface LocationSearch {
    id: string;
    post_id: string;
    address: string;
    city: string;
    results: string;
    created_at: string;
}
export async function nearbyProjects(db: DatabaseSync, address: string, latitude: number, longitude: number) {
    const rows = (await db.prepare('SELECT id,name,address,latitude,longitude FROM projects WHERE is_demo=0').all()) as {
        id: string;
        name: string;
        address: string;
        latitude: number | null;
        longitude: number | null;
    }[];
    return rows.map(p => ({ ...p, distance: p.latitude !== null && p.longitude !== null ? distanceMeters(latitude, longitude, p.latitude, p.longitude) : null, exact: normalizeAddress(p.address) === normalizeAddress(address) })).filter(p => p.exact || (p.distance !== null && p.distance < 100));
}
export async function createProjectFromPost(db: DatabaseSync, data: Record<string, unknown>) {
    const postId = required(data.postId, 'Публикация', 100), actor = required(data.actor, 'Автор', 200);
    const post = (await db.prepare('SELECT * FROM collected_posts WHERE id=?').get(postId));
    if (!post)
        throw new InputError('Публикация не найдена.');
    const linked = (await db.prepare('SELECT p.project_id FROM collected_links l JOIN publications p ON p.id=l.publication_id WHERE l.post_id=?').get(postId));
    if (linked)
        return String(linked.project_id);
    if (data.confirmAddress !== 'on' || data.confirmStage !== 'on')
        throw new InputError('Подтвердите адрес, точку на карте и стадию объекта.');
    if (!['construction', 'commissioned'].includes(String(data.stage)))
        throw new InputError('Укажите проверенную стадию строительства.');
    const publishedAt = isoDate(post.published_at || data.publishedAt);
    required(post.text, 'Текст публикации', 12000);
    let address: string, latitude: number, longitude: number, geoSource: string;
    if (data.searchId) {
        const search = (await db.prepare('SELECT * FROM location_searches WHERE id=? AND post_id=?').get(String(data.searchId), postId)) as LocationSearch | undefined;
        if (!search)
            throw new InputError('Результат поиска не найден.');
        const candidates = JSON.parse(search.results) as GeoCandidate[];
        const index = Number(data.candidateIndex);
        const candidate = Number.isInteger(index) ? candidates[index] : undefined;
        if (!candidate?.precise)
            throw new InputError('Выберите результат с номером дома или укажите точку вручную.');
        address = `${search.city}, ${search.address}`;
        latitude = candidate.latitude;
        longitude = candidate.longitude;
        geoSource = candidate.url;
    }
    else {
        address = `${required(data.city, 'Город', 100)}, ${required(data.address, 'Адрес', 200)}`;
        latitude = Number(required(data.latitude, 'Широта', 40));
        longitude = Number(required(data.longitude, 'Долгота', 40));
        geoSource = httpUrl(data.geoSource);
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 40 || latitude > 56 || longitude < 46 || longitude > 88)
        throw new InputError('Координаты должны находиться в пределах Казахстана.');
    const name = required(data.name, 'Название объекта', 200), developer = String(data.developer || '').trim() || 'Не установлен';
    const id = `ad-${postId}`;
    (await db.exec('BEGIN IMMEDIATE'));
    try {
        const duplicates = (await nearbyProjects(db, address, latitude, longitude)).filter(p => p.exact || (p.distance !== null && p.distance < 15));
        if (duplicates.length)
            throw new InputError(`В реестре уже есть объект по этому адресу или точке: ${duplicates.map(p => p.name).join(', ')}. Привяжите объявление к существующему объекту.`);
        (await addProject(db, { requestId: id, name, address, developer, bin: data.bin, stage: data.stage, latitude, longitude, source: `${post.platform} · ${post.account || 'Публичное объявление'}`, sourceUrl: post.url, actor, capturedAt: String(post.first_seen_at) }));
        const geoId = randomUUID();
        (await db.prepare("INSERT INTO evidence VALUES (?,?,'progress',?,?,?,?,0)").run(geoId, id, 'Источник координат', geoSource, `Адрес и координаты проверены: ${address}; ${latitude}, ${longitude}. ${data.searchId ? 'Photon / OpenStreetMap' : 'Ручной ввод по источнику'}. Проверил: ${actor}.`, new Date().toISOString()));
        (await linkCollectedPost(db, { postId, projectId: id, actor, confirmLink: 'on', publishedAt }));
        (await db.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?)').run(randomUUID(), id, actor, 'Объект создан из объявления', `Публикация ${postId}; источник координат ${geoSource}`, new Date().toISOString()));
        (await db.exec('COMMIT'));
        return id;
    }
    catch (e) {
        (await db.exec('ROLLBACK'));
        throw e;
    }
}

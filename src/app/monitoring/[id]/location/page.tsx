import {asyncMap} from '../../../../server/db/async-map';
import { requireAccess } from "@/server/auth/access";
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { databasePath, openDatabase } from '@/server/db/connection';
import { extractAddresses, mentionedCity } from '@/domain/addresses';
import { nearbyProjects, type LocationSearch } from '@/server/db/location-projects';
import type { GeoCandidate } from '@/server/geocoding/photon';
import { lookupAddressAction, createLocatedProjectAction } from '@/server/geocoding/actions';
import { ActionForm } from '@/components/action-form';
import { AuthorField } from '@/components/workflow-forms';
import { ProjectMap } from '@/components/project-map';
import { AdAssessmentCard } from '@/components/ad-assessment';
import type { Post } from '@/server/db/social';
export const dynamic = 'force-dynamic';
function ObjectFields({ needsDate }: {
    needsDate: boolean;
}) { return <><label>Название ЖК или объекта<input name="name" required maxLength={200}/></label><label>Застройщик, если установлен<input name="developer" maxLength={200}/></label><label>БИН, если установлен<input name="bin" pattern="[0-9]{12}" maxLength={12}/></label><label>Проверенная стадия<select name="stage" defaultValue="" required><option value="" disabled>Выберите стадию</option><option value="construction">Строительство</option><option value="commissioned">Введён в эксплуатацию</option></select></label>{needsDate ? <label>Дата публикации из оригинала<input type="date" name="publishedAt" required max={new Date().toISOString().slice(0, 10)}/></label> : null}<label className="checkbox-label"><input type="checkbox" name="confirmAddress" required/>Адрес, точка и связь объявления с объектом проверены</label><label className="checkbox-label"><input type="checkbox" name="confirmStage" required/>Стадия проверена; объявление не относится к другому дому</label><AuthorField /></>; }
export default async function LocationPage({ params, searchParams }: {
    params: Promise<{
        id: string;
    }>;
    searchParams: Promise<{
        search?: string;
    }>;
}) {
    await requireAccess();
    const { id } = await params;
    const query = await searchParams;
    const db = (await openDatabase(databasePath(), { readOnly: true }));
    const data = await (async () => {
        try {
            const post = (await db.prepare('SELECT * FROM collected_posts WHERE id=?').get(id)) as Post | undefined;
            if (!post)
                return null;
            const search = typeof query.search === 'string' ? (await db.prepare('SELECT * FROM location_searches WHERE id=? AND post_id=?').get(query.search, id)) as LocationSearch | undefined : undefined;
            const results = search ? JSON.parse(search.results) as GeoCandidate[] : [];
            const nearby = search ? (await (await asyncMap(results, async (c) => (await nearbyProjects(db, `${search.city}, ${search.address}`, c.latitude, c.longitude)))).flat()) : [];
            const linked = (await db.prepare('SELECT p.project_id FROM collected_links l JOIN publications p ON p.id=l.publication_id WHERE l.post_id=?').get(id));
            return { post, search, results, nearby: [...new Map(nearby.map(p => [p.id, p])).values()], linked: linked ? String(linked.project_id) : null };
        }
        finally {
            db.close();
        }
    })();
    if (!data)
        notFound();
    const { post, search, results } = data;
    const extracted = extractAddresses(post.text);
    const city = search?.city || mentionedCity(post.text);
    return <main id="main" className="page detail-page"><Link href="/monitoring">← Мониторинг</Link><h1>Из объявления на карту</h1><p><a href={post.url} target="_blank" rel="noreferrer">Оригинал публикации ↗</a></p><details><summary>Сохранённый текст</summary><p className="collected-text">{post.text}</p></details><AdAssessmentCard text={post.text} publishedAt={post.published_at} truncated={!!post.truncated}/>
 {data.linked ? <p className="notice">Объявление уже привязано: <Link href={`/projects/${data.linked}`}>открыть объект →</Link></p> : <>
 <section><h2>1. Проверить адрес</h2>{extracted.length ? <><p>Из текста извлечено:</p><ul>{extracted.map(a => <li key={a}>{a}</li>)}</ul></> : <p>Адрес с номером дома не распознан. Укажите его после проверки оригинала.</p>}
 <ActionForm action={lookupAddressAction} label="Найти координаты" pendingLabel="Поиск координат…"><input type="hidden" name="postId" value={id}/><label>Город<input name="city" required maxLength={100} defaultValue={city}/></label><label>Улица и номер дома<input name="address" required maxLength={200} defaultValue={search?.address || (extracted.length === 1 ? extracted[0] : '')} list="extracted-addresses"/></label><datalist id="extracted-addresses">{extracted.map(a => <option key={a} value={a}/>)}</datalist><p className="muted">Photon получает только указанные адрес и город. Текст объявления и контакты не отправляются. Координаты: © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>.</p></ActionForm></section>
 {search ? <section><h2>2. Проверить точку и дубли</h2>{results.length ? <><ProjectMap preview projects={results.map((r, i) => ({ id: String(i), name: `Вариант ${i + 1}`, address: r.label, latitude: r.latitude, longitude: r.longitude, score: 0, zone: 'green', needsReview: true }))}/><p>Это варианты геокодера, ещё не объекты реестра. Сверьте улицу, номер дома и город.</p></> : <p className="notice">Совпадений в Казахстане нет. Уточните адрес или используйте ручной ввод ниже.</p>}
 {data.nearby.length ? <div className="notice"><strong>В реестре есть объекты рядом или по этому адресу</strong><ul>{data.nearby.map(p => <li key={p.id}><Link href={`/projects/${p.id}`}>{p.name}</Link> · {p.address}{p.distance !== null ? ` · ${Math.round(p.distance)} м` : ''}</li>)}</ul><Link href="/monitoring">Вернуться в ленту и привязать к существующему объекту</Link></div> : null}
 {results.length ? <ActionForm action={createLocatedProjectAction} label="Создать объект из объявления"><input type="hidden" name="postId" value={id}/><input type="hidden" name="searchId" value={search.id}/><fieldset><legend>Выберите точку</legend>{results.map((r, i) => <label key={i} className="search-pack"><span><input type="radio" name="candidateIndex" value={i} required disabled={!r.precise}/>Вариант {i + 1}: {r.label}</span><span>{r.latitude}, {r.longitude} · {!r.precise ? 'Нет точного номера дома — используйте ручной ввод' : 'Дом найден, нужна сверка'} · <a href={r.url} target="_blank" rel="noreferrer">Источник OSM ↗</a></span></label>)}</fieldset><ObjectFields needsDate={!post.published_at}/></ActionForm> : null}</section> : null}
 <section><details><summary>Указать координаты вручную по источнику</summary><ActionForm action={createLocatedProjectAction} label="Создать объект по проверенным координатам"><input type="hidden" name="postId" value={id}/><label>Город<input name="city" required maxLength={100} defaultValue={city}/></label><label>Адрес<input name="address" required maxLength={200} defaultValue={search?.address || (extracted.length === 1 ? extracted[0] : '')}/></label><div className="form-grid"><label>Широта<input type="number" step="any" min="40" max="56" name="latitude" required/></label><label>Долгота<input type="number" step="any" min="46" max="88" name="longitude" required/></label></div><label>Ссылка на источник координат<input type="url" name="geoSource" required maxLength={2000}/></label><ObjectFields needsDate={!post.published_at}/></ActionForm></details></section><p className="muted">Объявление будет привязано к объекту, источники сохранятся. Баллы риска без подтверждения факторов не начисляются. Введённые дома остаются в реестре, но не на карте строительства.</p></>}
 </main>;
}

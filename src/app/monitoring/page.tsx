import { requireAccess } from "@/server/auth/access";
import { extractAddresses } from "@/domain/addresses";
import { getProjects } from "@/server/projects";
import { linkPostAction } from "@/server/actions";
import { AuthorField } from "@/components/workflow-forms";
import { ProjectMatches } from "@/components/project-matches";
import { AdAssessmentCard } from "@/components/ad-assessment";
import { collectionStatus, CANCELLED_MESSAGE } from "@/server/db/collection-status";
import Link from "next/link";
import { SEARCH_PACKS, splitTerms, paymentMentions } from "@/domain/search-packs";
import { PLATFORMS } from "@/domain/social";
import { databasePath, openDatabase } from "@/server/db/connection";
import { jobs, postFeed, searches, workerActive } from "@/server/db/social";
import { apifyConfigured } from "@/server/social/apify";
import { cancelJobAction, installPacksAction, archiveAction, createSearchAction, queueAction, resolveAction, toggleSearchAction } from "@/server/social/actions";
import { ActionForm } from "@/components/action-form";
import { CollectionRefresh } from "@/components/collection-refresh";
export const dynamic = "force-dynamic";
const statusNames: Record<string, string> = { queued: "В очереди", starting: "Запуск", running: "Сбор", succeeded: "Завершён", failed: "Ошибка", uncertain: "Требует сверки" };
const date = (s: string | null) => s ? new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(s)) : "Дата не предоставлена";
export default async function MonitoringPage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    await requireAccess();
    const params = await searchParams;
    const projects = (await getProjects()).filter(p => !p.isDemo);
    const platform = typeof params.platform === "string" ? params.platform : "";
    const city = typeof params.city === "string" ? params.city : "";
    const archived = params.archived === "1";
    const sort = params.sort === 'recent' ? 'recent' : 'priority';
    const category = typeof params.category === 'string' && ['candidate', 'review', 'attention', 'housing', 'other', 'insufficient'].includes(params.category) ? params.category : '';
    const page = Math.max(1, Math.min(10000, Math.floor(Number(params.page) || 1)));
    const db = (await openDatabase(databasePath(), { readOnly: true }));
    const data = await (async () => { try {
        return { collection: (await collectionStatus(db)), links: (await db.prepare("SELECT l.post_id, p.project_id FROM collected_links l JOIN publications p ON p.id=l.publication_id").all()) as {
                post_id: string;
                project_id: string;
            }[], searches: (await searches(db)), jobs: (await jobs(db)), ...(await postFeed(db, platform, city, archived, page, sort, category)), active: (await workerActive(db)) };
    }
    finally {
        db.close();
    } })();
    const pageHref = (n: number) => `/monitoring?${new URLSearchParams({ platform, city, sort, category, archived: archived ? "1" : "0", page: String(n) })}`;
    return <main id="main" className="page detail-page">
    <Link href="/" className="back-link">Вернуться в реестр</Link>
    <div className="collection-heading"><div><p className="eyebrow">Публичные публикации</p><h1>Мониторинг соцсетей</h1></div><CollectionRefresh /></div>
    <p>Поиск по фразе и городу в TikTok, Facebook и Instagram. Найденные публикации требуют проверки: выдача может содержать нерелевантные записи и старые объявления.</p>
    <p className="notice">TikTok: видео · Facebook: публичные посты · Instagram: популярные Reels по запросу. Город добавляется в поисковую фразу, это не проверка геолокации. Полный охват рекламы не гарантируется; пустая выдача не означает отсутствие объявлений.</p>
    <div className="collection-status"><strong>{apifyConfigured() ? "Сбор подключён" : "Сбор не подключён"}</strong><span>{process.env.VERCEL ? (data.active ? "Последний запуск сбора — в пределах суток" : "Ожидается первый запуск расписания или требуется проверка") : (data.active ? "Сборщик работает" : "Сборщик остановлен")}</span><span>До $0,50 TikTok / $0,20 Facebook и Instagram · общий бюджет запусков $1 за 24 часа</span></div>
    {process.env.VERCEL ? <p>Плановый сбор: ежедневно, 17:00–17:59 по Алматы. Обработка очереди ограничена бюджетом.</p> : null}<section aria-label="Состояние сбора"><h2>Состояние сбора</h2><div className="feed-summary"><span>Зарезервировано за 24 ч: <strong>${data.collection.reserved.toFixed(2)}</strong></span><span>Доступно: <strong>${data.collection.available.toFixed(2)}</strong></span></div>{data.collection.waiting ? <p className="notice">Очередь ждёт освобождения бюджета. Ориентир для первого задания: {date(data.collection.nextAt)} (Алматы). Время может измениться при обновлении текущих запусков; это не фактическое списание.</p> : data.collection.nextAt ? <p>Первое задание укладывается в лимит. {process.env.VERCEL ? 'Следующая обработка — по расписанию или при поступлении результатов.' : (data.active ? 'Сборщик обработает его в следующем цикле.' : 'Для запуска нужен работающий сборщик.')}</p> : <p>Очередь пуста.</p>}<div className="collection-searches">{data.collection.platforms.map(p => <article className="evidence-item" key={p.platform}><h3>{PLATFORMS[p.platform]}</h3><p>Сохранено публикаций: {p.posts} · В очереди: {p.queued} · Выполняется: {p.running}</p><p className="muted">Последний успешный запуск: {p.last_success ? date(p.last_success) : 'Ещё не было'}</p>{p.uncertain ? <p className="notice">Требуют сверки: {p.uncertain}</p> : null}</article>)}</div></section>
    <p><Link href="/analyst-guide">Порядок проверки →</Link></p>
    <section><h2>48 поисковых тегов и фраз · RU / KZ</h2>
      <p>Наборы объединяют до 8 фраз в один запуск на площадке. Для Усть-Каменогорска чередуются написания «Усть-Каменогорск», «Өскемен» и «Усть Каменогорск». Это поисковые запросы, а не подтверждённые факторы риска.</p>
      <details className="collection-create"><summary>Выбрать наборы для сбора</summary>
      <ActionForm action={installPacksAction} label="Добавить выбранные наборы">
       <label>Город для наборов<input name="city" defaultValue="Усть-Каменогорск" maxLength={80} required/></label>
       {SEARCH_PACKS.map(pack => <label key={pack.id} className="search-pack"><span><input type="checkbox" name="packs" value={pack.id} defaultChecked/> <strong>{pack.title}</strong></span><span>{pack.terms.join(" · ")}</span></label>)}
       <label><input type="checkbox" name="enabled"/>Включить сбор выбранных наборов раз в неделю</label>
       <p>Все 6 наборов — 18 поисков на трёх площадках, до 40 записей за запуск. При бюджете $1 за 24 часа полный обход займёт несколько дней. Повторное добавление не создаёт дубли.</p>
      </ActionForm></details>
    </section>
    <section aria-labelledby="searches-title"><h2 id="searches-title">Сохранённые поиски</h2>
      <details className="collection-create"><summary>Добавить поиск</summary>
        <ActionForm action={createSearchAction} label="Сохранить поиск">
          <label>Город<input name="city" required maxLength={80} defaultValue="Усть-Каменогорск"/></label>
          <label>Поисковые фразы (до 8, разделитель |)<input name="keywords" required maxLength={1000} defaultValue="новостройки"/></label>
          <label>Площадка<select name="platform">{Object.entries(PLATFORMS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          <label>Лимит результатов<input name="resultLimit" type="number" min="1" max="50" defaultValue="5" required/></label>
          <label>Интервал<select name="intervalHours" defaultValue="24">{[6, 12, 24, 48, 168].map((n) => <option value={n} key={n}>{n} ч.</option>)}</select></label>
          <p>Поиск сохраняется на паузе. Запустите его однократно или включите расписание.</p>
        </ActionForm>
      </details>
      <details open={data.searches.length < 10}><summary>Управление поисками ({data.searches.length}) · активно {data.searches.filter(s => s.enabled).length}</summary><div className="collection-searches">{data.searches.map((s) => <article key={s.id} className="evidence-item">
        <h3>{PLATFORMS[s.platform]} · {s.city}</h3><details><summary>{splitTerms(s.keywords).length} фраз · до {s.resultLimit} результатов · интервал {s.intervalHours} ч.</summary><p>{s.keywords}</p></details>
        <p>{s.enabled ? `Расписание включено. Следующий сбор: ${date(s.next_run_at)}` : "Расписание на паузе"}</p>
        <div className="collection-controls"><ActionForm action={queueAction} label="Собрать сейчас"><input type="hidden" name="id" value={s.id}/></ActionForm>
          <ActionForm action={toggleSearchAction} label={s.enabled ? "Приостановить" : "Включить расписание"}><input type="hidden" name="id" value={s.id}/><input type="hidden" name="enabled" value={s.enabled ? "0" : "1"}/></ActionForm></div>
      </article>)}</div>
      </details>
      {!data.searches.length ? <p>Создайте первый поиск. Подключение ключа само по себе не запускает сбор.</p> : null}
    </section>
    <section aria-labelledby="feed-title"><h2 id="feed-title">Лента публикаций</h2><p><Link href={`/monitoring?${new URLSearchParams({ platform, city, sort: "priority", category: "attention", archived: archived ? "1" : "0" })}#feed-title`}>Открыть очередь проверки →</Link></p>
      <div className="feed-summary" aria-label="Качество выдачи"><span>Всего: <strong>{data.total}</strong></span><span>С признаками R2/R3: <strong>{data.counts.candidate}</strong></span><span>Неоднозначные условия: <strong>{data.counts.review}</strong></span><span>Жильё без явных признаков: <strong>{data.counts.housing}</strong></span><span>Возможно нерелевантно: <strong>{data.counts.other}</strong></span><span>Недостаточно текста: <strong>{data.counts.insufficient}</strong></span></div><p className="muted">Сводка по выбранным площадке, городу и архиву, до фильтра оценки. По текущему фильтру: {data.matched}.</p>
      <form method="get" className="collection-filters">
        <label>Площадка в ленте<select name="platform" defaultValue={platform}><option value="">Все площадки</option>{Object.entries(PLATFORMS).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>Город поиска<select name="city" defaultValue={city}><option value="">Все города</option>{[...new Set(data.searches.map((s) => s.city))].map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Оценка<select name="category" defaultValue={category}><option value="">Все объявления</option><option value="attention">Очередь проверки: признаки, спорные, без текста</option><option value="candidate">Есть признаки R2/R3</option><option value="review">Неоднозначные условия оплаты</option><option value="housing">Жильё без явных признаков</option><option value="other">Возможно нерелевантные</option><option value="insufficient">Недостаточно текста</option></select></label><label>Сортировка<select name="sort" defaultValue={sort}><option value="priority">Сначала с признаками</option><option value="recent">Сначала новые</option></select></label><label>Показать<select name="archived" defaultValue={archived ? "1" : "0"}><option value="0">Входящие</option><option value="1">Архив</option></select></label><button type="submit">Применить</button>
      </form>
      <div className="evidence-list">{data.posts.slice(0, 30).map((p) => <article className="evidence-item collected-post" key={p.id}>
        <div className="collection-heading"><h3>{PLATFORMS[p.platform]} · {p.account || "Автор не предоставлен"}</h3><span className="demo-label">Требует проверки</span></div>
        <p className="muted">Опубликовано: {date(p.published_at)} · Найдено: {date(p.first_seen_at)} (Алматы, UTC+5)</p>
        <AdAssessmentCard text={p.text} publishedAt={p.published_at} truncated={!!p.truncated}/><details><summary>По каким запросам найдено</summary><p>{p.queries}</p></details>{paymentMentions(p.text).length ? <p className="notice">Слова для проверки: {paymentMentions(p.text).join(" · ")}. Совпадение слова не подтверждает оплату: проверьте контекст и отрицания.</p> : null}<p className="collected-text">{p.text || "Текст не предоставлен. Просмотрите оригинал публикации."}</p>
        {p.truncated ? <p className="notice">Сервис вернул сокращённый текст.</p> : null}
        <a href={p.url} target="_blank" rel="noreferrer">Открыть оригинал ↗</a>
        <p className="address-extraction">{extractAddresses(p.text).length ? `Адреса из текста: ${extractAddresses(p.text).join("; ")}` : "Адрес с номером дома не распознан"} · <Link href={`/monitoring/${p.id}/location`}>Проверить адрес и добавить на карту →</Link></p>
        <ProjectMatches text={p.text} projects={projects}/>{data.links.find(l => l.post_id === p.id) ? <p><Link href={`/projects/${data.links.find(l => l.post_id === p.id)!.project_id}#publications`}>Открыть связанный объект →</Link></p> : projects.length ? <details><summary>Привязать к объекту</summary><ActionForm action={linkPostAction} label="Привязать публикацию"><input type="hidden" name="postId" value={p.id}/><label>Объект<select name="projectId" required><option value="">Выберите ЖК</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name} · {project.address}</option>)}</select></label>{!p.published_at ? <label>Дата публикации из оригинала<input name="publishedAt" type="date" required max={new Date().toISOString().slice(0, 10)}/></label> : null}<label className="checkbox-label"><input type="checkbox" name="confirmLink" required/>Совпадение объекта проверено по адресу или застройщику</label><AuthorField /></ActionForm></details> : <p><Link href="/projects/new">Добавьте объект для привязки</Link></p>}
        <ActionForm action={archiveAction} label={archived ? "Вернуть во входящие" : "Убрать в архив"}><input type="hidden" name="id" value={p.id}/><input type="hidden" name="archived" value={archived ? "0" : "1"}/></ActionForm>
      </article>)}</div>
      {!data.posts.length ? <p className="notice">Публикаций в этой выборке пока нет. Проверьте журнал сбора ниже.</p> : null}
      <nav className="collection-controls" aria-label="Страницы ленты">{page > 1 ? <Link href={pageHref(page - 1)}>Назад</Link> : null}{data.posts.length > 30 ? <Link href={pageHref(page + 1)}>Следующая страница</Link> : null}</nav>
      <p className="muted">Привязка публикации не начисляет баллы риска: подтвердите факторы в карточке объекта. Текст видео и изображения пока не распознаются.</p>
    </section>
    <section><h2>Журнал сбора</h2><p>Последние 100 запусков. Лимит расходов резервируется даже при сбое; фактическая стоимость может быть меньше.</p>
      <div className="evidence-list">{data.jobs.map((j) => {
            const s = data.searches.find((s) => s.id === j.search_id);
            return <article className="evidence-item" key={j.id}>
        <h3>{s ? `${PLATFORMS[s.platform]} · ${s.city} · ${s.keywords}` : j.search_id} — {j.error === CANCELLED_MESSAGE ? "Отменён" : statusNames[j.status]}</h3>
        <p>{date(j.created_at)} · получено {j.received} · новых {j.imported} · пропущено {j.skipped}{j.actual_usd !== null ? ` · стоимость $${j.actual_usd.toFixed(4)}` : ""}</p>
        {j.error ? <p className="notice">{j.error}</p> : null}
        {j.status === "queued" ? <ActionForm action={cancelJobAction} label="Отменить задание"><input type="hidden" name="id" value={j.id}/><p>Отмена только этого запуска. Расписание поиска остаётся включённым, если не приостановить его отдельно.</p></ActionForm> : null}
        {j.run_id ? <a target="_blank" rel="noreferrer" href={`https://console.apify.com/actors/runs/${encodeURIComponent(j.run_id)}`}>Запуск в Apify ↗</a> : null}
        {j.status === "uncertain" ? <ActionForm action={resolveAction} label="Завершить сверку"><input type="hidden" name="id" value={j.id}/><label><input type="checkbox" name="checked" required/>Проверил Apify Console: повторный сбор допустим</label></ActionForm> : null}
      </article>;
        })}</div>
    </section>
  </main>;
}

import { requireAccess } from "@/server/auth/access";
import Link from "next/link";
import { ProjectMap } from "@/components/project-map";
import { databasePath, openDatabase } from "@/server/db/connection";
import { FACTOR_RULES } from "@/domain/risk";
import { getProjects } from "@/server/projects";
import { DatabaseNotReadyError } from "@/server/db/connection";
import { RiskBadge, ZONE_LABELS } from "@/components/risk-badge";
import type { Project } from "@/server/db/projects";
import type { Zone } from "@/domain/risk";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Home({ searchParams }: {
    searchParams: Promise<{
        q?: string;
        zone?: string;
    }>;
}) {
    await requireAccess();
    const params = await searchParams;
    const q = typeof params.q === "string" ? params.q.slice(0, 200).trim() : "";
    const zone = typeof params.zone === "string" && ["green", "yellow", "red"].includes(params.zone) ? params.zone as Zone : "";
    let projects: Project[];
    try {
        projects = (await getProjects());
    }
    catch (error) {
        if (!(error instanceof DatabaseNotReadyError))
            throw error;
        return <main id="main" className="page"><h1>Подготовьте базу данных</h1><p>Создайте базу данных перед добавлением объектов.</p><pre>npm run db:setup</pre><p>Затем обновите эту страницу.</p></main>;
    }
    const filtered = projects.filter((project) => (!zone || project.risk.zone === zone)
        && `${project.name} ${project.developer} ${project.address}`.toLocaleLowerCase("ru").includes(q.toLocaleLowerCase("ru")))
        .toSorted((a, b) => b.risk.score - a.risk.score || a.name.localeCompare(b.name, "ru"));
    const db = (await openDatabase(databasePath(), { readOnly: true }));
    const totals = await (async () => { try {
        return (await db.prepare("SELECT (SELECT count(*) FROM collected_posts WHERE archived=0) AS publications,(SELECT count(*) FROM signals WHERE status='pending') AS signals").get())!;
    }
    finally {
        db.close();
    } })();
    const count = (value: Zone) => projects.filter((project) => project.risk.zone === value).length;
    return (<main id="main" className="page">
      <div className="page-title"><div><h1>Обзор строительства</h1><p>Усть-Каменогорск · Приоритеты проверки</p></div><Link href="/projects/new" className="primary-link">+ Добавить объект</Link></div>
      <div className="dashboard-metrics"><article><span>Объектов</span><strong>{projects.length}</strong></article><article><span>Нужна проверка</span><strong>{projects.filter(p => p.risk.needsReview).length}</strong></article><article><Link href="/monitoring">Публикации</Link><strong>{String(totals.publications)}</strong></article><article><span>Сигналов на рассмотрении</span><strong>{String(totals.signals)}</strong></article></div>
      <div className="summary-line" aria-label="Распределение объектов по зонам">
        <span><i className="risk-dot red"/>Красная <strong>{count("red")}</strong></span>
        <span><i className="risk-dot yellow"/>Жёлтая <strong>{count("yellow")}</strong></span>
        <span><i className="risk-dot green"/>0–24 балла <strong>{count("green")}</strong></span>
        <span className="summary-note">Балл определяет приоритет проверки, а не факт нарушения.</span>
      </div>
      <form className="filters" action="/">
        <div className="search-field"><label htmlFor="q">Поиск ЖК или застройщика</label><input id="q" name="q" type="search" defaultValue={q} placeholder="Название или адрес" maxLength={200}/></div>
        <div><label htmlFor="zone">Зона риска</label><select id="zone" name="zone" defaultValue={zone}><option value="">Все зоны</option>{Object.entries(ZONE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <button type="submit">Найти</button>
        {q || zone ? <Link href="/" className="reset-link">Сбросить</Link> : null}
      </form>
      <ProjectMap projects={filtered.filter(p => p.stage === 'construction').map(p => ({ id: p.id, name: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude, score: p.risk.score, zone: p.risk.zone, needsReview: p.risk.needsReview }))}/>
      <p className="map-caption">Отметки — координаты из источников. Серый маркер: оценка ещё не подтверждена. {filtered.filter(p => p.latitude === null || p.longitude === null).length ? `${filtered.filter(p => p.latitude === null || p.longitude === null).length} объектов без координат показаны только в списке.` : ""}</p>
      <div className="list-heading"><h2>Объекты по приоритету</h2><span aria-live="polite">Показано {filtered.length} из {projects.length}</span></div>
      {filtered.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Жилой комплекс</th><th scope="col">Балл</th><th scope="col">Зона риска</th><th scope="col">Подтверждённые факторы</th><th scope="col">Проверка данных</th></tr></thead>
        <tbody>{filtered.map((project) => <tr key={project.id}>
          <td><Link className="project-link" href={`/projects/${project.id}`}>{project.name}<svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5"/></svg></Link><span className="cell-secondary">{project.developer}</span></td>
          <td><span className="score">{project.risk.score}</span><span className="score-max"> / 100</span></td>
          <td>{project.risk.score === 0 && project.risk.needsReview ? <span className="risk-badge unknown">Не проверено</span> : <RiskBadge zone={project.risk.zone}/>}</td>
          <td><span className="factor-codes">{project.risk.factors.filter((factor) => factor.counted).map((factor) => factor.code).join(" · ") || "Нет"}</span><span className="cell-secondary">{project.publications.length} публ.</span></td>
          <td>{project.risk.needsReview ? <span className="needs-review">Нужна проверка</span> : <span>Источники сохранены</span>}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>{projects.length ? "Объекты не найдены" : "Реестр пока пуст"}</h3><p>{projects.length ? "Измените запрос или сбросьте фильтры." : "Добавьте объект с адресом и ссылкой на источник."}</p>{projects.length ? <Link href="/">Показать все объекты</Link> : null}</div>}
      <details className="rules"><summary>Как рассчитывается риск</summary><p>Учитываются только подтверждённые факторы с источником, автором и датой проверки. Неизвестные сведения и гипотезы дают 0 баллов.</p><ul>{Object.entries(FACTOR_RULES).map(([code, rule]) => <li key={code}>{code} · {rule.title} — {rule.weight} баллов</li>)}</ul><p>Зелёная зона: 0–24. Жёлтая: 25–59 и 60+ без сочетания R1 и R2. Красная: от 60, если одновременно подтверждены отсутствие правового основания (R1) и предложение внести деньги (R2).</p></details>
    </main>);
}

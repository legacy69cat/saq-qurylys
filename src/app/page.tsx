import Link from "next/link";
import { getProjects } from "@/server/projects";
import { DatabaseNotReadyError } from "@/server/db/connection";
import { RiskBadge, ZONE_LABELS } from "@/components/risk-badge";
import type { Project } from "@/server/db/projects";
import type { Zone } from "@/domain/risk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string; zone?: string }> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 200).trim() : "";
  const zone = typeof params.zone === "string" && ["green", "yellow", "red"].includes(params.zone) ? params.zone as Zone : "";
  let projects: Project[];
  try { projects = getProjects(); }
  catch (error) {
    if (!(error instanceof DatabaseNotReadyError)) throw error;
    return <main id="main" className="page"><h1>Подготовьте демонстрационные данные</h1><p>Для первого запуска создайте базу и загрузите учебные сценарии.</p><pre>npm run db:setup</pre><p>Затем обновите эту страницу.</p></main>;
  }
  const filtered = projects.filter((project) => (!zone || project.risk.zone === zone)
    && `${project.name} ${project.developer} ${project.address}`.toLocaleLowerCase("ru").includes(q.toLocaleLowerCase("ru")))
    .toSorted((a, b) => b.risk.score - a.risk.score || a.name.localeCompare(b.name, "ru"));
  const count = (value: Zone) => projects.filter((project) => project.risk.zone === value).length;
  return (
    <main id="main" className="page">
      <div className="page-title"><div><h1>Реестр объектов</h1><p>Приоритет проверки строящегося жилья</p></div><span className="record-count">{projects.length} ЖК · {projects.reduce((sum, item) => sum + item.publications.length, 0)} публикаций</span></div>
      <div className="summary-line" aria-label="Распределение объектов по зонам">
        <span><i className="risk-dot red" />Красная <strong>{count("red")}</strong></span>
        <span><i className="risk-dot yellow" />Жёлтая <strong>{count("yellow")}</strong></span>
        <span><i className="risk-dot green" />Зелёная <strong>{count("green")}</strong></span>
        <span className="summary-note">Балл определяет приоритет проверки, а не факт нарушения.</span>
      </div>
      <form className="filters" action="/">
        <div className="search-field"><label htmlFor="q">Поиск ЖК или застройщика</label><input id="q" name="q" type="search" defaultValue={q} placeholder="Название или адрес" maxLength={200} /></div>
        <div><label htmlFor="zone">Зона риска</label><select id="zone" name="zone" defaultValue={zone}><option value="">Все зоны</option>{Object.entries(ZONE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <button type="submit">Найти</button>
        {q || zone ? <Link href="/" className="reset-link">Сбросить</Link> : null}
      </form>
      <div className="list-heading"><h2>Объекты по приоритету</h2><span aria-live="polite">Показано {filtered.length} из {projects.length}</span></div>
      {filtered.length ? <div className="table-wrap"><table>
        <thead><tr><th scope="col">Жилой комплекс</th><th scope="col">Балл</th><th scope="col">Зона риска</th><th scope="col">Подтверждённые факторы</th><th scope="col">Проверка данных</th></tr></thead>
        <tbody>{filtered.map((project) => <tr key={project.id}>
          <td><Link className="project-link" href={`/projects/${project.id}`}>{project.name}<svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" /></svg></Link><span className="cell-secondary">{project.developer}</span></td>
          <td><span className="score">{project.risk.score}</span><span className="score-max"> / 100</span></td>
          <td><RiskBadge zone={project.risk.zone} /></td>
          <td><span className="factor-codes">{project.risk.factors.filter((factor) => factor.counted).map((factor) => factor.code).join(" · ") || "Нет"}</span><span className="cell-secondary">{project.publications.length} публ.</span></td>
          <td>{project.risk.needsReview ? <span className="needs-review">Нужна проверка</span> : <span>Источники сохранены</span>}</td>
        </tr>)}</tbody>
      </table></div> : <div className="empty-state"><h3>{projects.length ? "Объекты не найдены" : "Реестр пока пуст"}</h3><p>{projects.length ? "Измените запрос или сбросьте фильтры." : "Загрузите демонстрационные данные командой npm run db:seed."}</p>{projects.length ? <Link href="/">Показать все объекты</Link> : null}</div>}
      <details className="rules"><summary>Как рассчитывается риск</summary><p>Учитываются только подтверждённые факторы с источником, автором и датой проверки. Неизвестные сведения и гипотезы дают 0 баллов.</p><p>Зелёная зона: 0–24. Жёлтая: 25–59 и 60+ без сочетания R1 и R2. Красная: от 60, если одновременно подтверждены отсутствие правового основания (R1) и предложение внести деньги (R2).</p></details>
    </main>
  );
}

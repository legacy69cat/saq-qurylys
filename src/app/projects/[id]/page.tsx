import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjects } from "@/server/projects";
import { RiskBadge } from "@/components/risk-badge";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const date = (value: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(value));
const basisNames = { unknown: "Не установлено", none: "Отсутствие подтверждено", guarantee: "Гарантия Единого оператора", mio_permission: "Разрешение МИО", other: "Иное основание" };
const statusNames = { unknown: "Нужна проверка", present: "Подтверждено", absent: "Отсутствие подтверждено" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProjects().find((item) => item.id === id);
  if (!project) notFound();
  return <main id="main" className="page detail-page">
    <Link href="/" className="back-link">Вернуться в реестр</Link>
    <div className="page-title"><div><h1>{project.name}</h1><p>{project.address}</p></div><div className="detail-score"><strong>{project.risk.score}<small> / 100</small></strong><RiskBadge zone={project.risk.zone} /></div></div>
    <p className="scenario">Учебный сценарий: {project.scenario}</p>
    <dl className="project-facts">
      <div><dt>Застройщик</dt><dd>{project.developer}</dd></div>
      <div><dt>Демо-идентификатор БИН</dt><dd>{project.bin}</dd></div>
      <div><dt>Стадия</dt><dd>{project.stage === "construction" ? "Строительство" : "Введён в эксплуатацию"}</dd></div>
      <div><dt>Правовое основание</dt><dd>{basisNames[project.legalBasis.type]}</dd></div>
      <div><dt>Проверка основания</dt><dd>{statusNames[project.legalBasis.status]}</dd></div>
      <div><dt>Готовность</dt><dd>{project.progress.map((item) => `${item.kind === "claimed" ? "Заявлено" : "Подтверждено"}: ${item.percent}%`).join(" · ")}</dd></div>
    </dl>
    <section aria-labelledby="risk-heading"><div className="list-heading"><h2 id="risk-heading">Из чего складывается риск</h2><span>Правила {project.risk.rulesVersion}</span></div>
      <div className="factor-list">{project.risk.factors.map((factor) => <div className="factor-row" key={factor.code}>
        <span className="factor-code">{factor.code}</span><div><h3>{factor.title}</h3><p>{factor.reason}</p>{factor.evidenceIds.length ? <div className="evidence-links">{factor.evidenceIds.map((id, index) => <a key={id} href={`#evidence-${id}`}>Источник {index + 1}</a>)}</div> : null}</div><strong className={factor.counted ? "counted" : "not-counted"}>{factor.counted ? "+" : ""}{factor.points}</strong>
      </div>)}</div>
    </section>
    <section aria-labelledby="evidence-heading"><div className="list-heading"><h2 id="evidence-heading">Сохранённые материалы</h2><span>{project.evidence.length} источников</span></div>
      <div className="evidence-list">{project.evidence.map((item) => <article id={`evidence-${item.id}`} key={item.id} className="evidence-item"><h3>{item.source}</h3><p>{item.text}</p><div className="evidence-meta"><span>Зафиксировано {date(item.capturedAt)} (Алматы)</span><span>Демо</span></div>{item.url ? <p className="source-url">Адрес примера: {item.url}</p> : null}</article>)}</div>
    </section>
    <p className="stage-note">На этом этапе доступен просмотр данных и расчёта. Ввод публикаций, ИИ-анализ и проверка сигналов будут добавлены далее.</p>
  </main>;
}

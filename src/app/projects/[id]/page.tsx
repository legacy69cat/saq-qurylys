import { checkRegistryAction } from "@/server/registries/actions";
import { ActionForm } from "@/components/action-form";
import { AuthorField } from "@/components/workflow-forms";
import { requireAccess } from "@/server/auth/access";
import Link from "next/link";
import { databasePath, openDatabase } from "@/server/db/connection";
import { workflowForProject } from "@/server/db/workflow";
import { aiConfigured } from "@/server/ai/analyze";
import { Publications } from "@/components/publications";
import { DocumentFactorForm, PublicationForm, LegalCheckForm, SignalForm } from "@/components/workflow-forms";
import { SIGNAL_STATUS } from "@/domain/display";
import { notFound } from "next/navigation";
import { getProjects } from "@/server/projects";
import { RiskBadge } from "@/components/risk-badge";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const date = (value: string) => new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(value));
const basisNames = { unknown: "Не установлено", none: "Отсутствие подтверждено", guarantee: "Гарантия Единого оператора", mio_permission: "Разрешение МИО", other: "Иное основание" };
const statusNames = { unknown: "Нужна проверка", present: "Подтверждено", absent: "Отсутствие подтверждено" };
export default async function ProjectPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    await requireAccess();
    const { id } = await params;
    const project = (await getProjects()).find((item) => item.id === id);
    if (!project)
        notFound();
    const db = (await openDatabase(databasePath(), { readOnly: true }));
    const workflow = await (async () => { try {
        return (await workflowForProject(db, id));
    }
    finally {
        db.close();
    } })();
    return <main id="main" className="page detail-page">
    {project.isDemo?<p className="notice">Демонстрационный объект. Все сведения вымышлены.</p>:null}
    <Link href="/" className="back-link">Вернуться в реестр</Link>
    <div className="page-title"><div><h1>{project.name}</h1><p>{project.address}</p></div><div className="detail-score"><strong>{project.risk.score}<small> / 100</small></strong>{project.risk.score === 0 && project.risk.needsReview ? <span className="risk-badge unknown">Не проверено</span> : <RiskBadge zone={project.risk.zone}/>}</div></div>
    {project.source ? <p className="evidence-meta">Источник: <a href={project.source.url} target="_blank" rel="noreferrer">{project.source.source} ↗</a> · {date(project.source.capturedAt)}. Стадия и координаты указаны по источнику.</p> : null}
    <dl className="project-facts">
      <div><dt>Застройщик</dt><dd>{project.developer}</dd></div>
      <div><dt>БИН</dt><dd>{project.bin}</dd></div>
      <div><dt>Стадия</dt><dd>{project.stage === "construction" ? "Строительство" : "Введён в эксплуатацию"}</dd></div>
      <div><dt>Правовое основание</dt><dd>{basisNames[project.legalBasis.type]}</dd></div>
      <div><dt>Проверка основания</dt><dd>{statusNames[project.legalBasis.status]}</dd></div>
      <div><dt>Готовность</dt><dd>{project.progress.map((item) => `${item.kind === "claimed" ? "Заявлено" : "Подтверждено"}: ${item.percent}%`).join(" · ") || "Не установлена"}</dd></div>
    </dl>
    <p className="evidence-meta">Проверка основания: {project.legalBasis.reviewedBy || "Не выполнена"}{project.legalBasis.reviewedAt ? ` · ${date(project.legalBasis.reviewedAt)} (Алматы)` : ""}</p>
    <div className="evidence-links">{project.legalBasis.evidenceIds.map((sourceId) => <a key={sourceId} href={`#evidence-${sourceId}`}>Источник проверки основания</a>)}</div>
    <section><h2>Проверка правового основания</h2><p><Link href="/sources">Открытые реестры и источники РК ↗</Link></p><details><summary>Сохранить результат ручной проверки</summary><LegalCheckForm projectId={id}/></details></section>
    <section><details><summary>Добавить публикацию вручную</summary><PublicationForm projectId={id}/></details></section>
    <Publications project={project} workflow={workflow} aiReady={aiConfigured()}/>
    <section aria-labelledby="risk-heading"><div className="list-heading"><h2 id="risk-heading">Из чего складывается риск</h2><span>Правила {project.risk.rulesVersion}</span></div>
      <div className="factor-list">{project.risk.factors.map((factor) => <div className="factor-row" key={factor.code}>
        <span className="factor-code">{factor.code}</span><div><h3>{factor.title}</h3><p>{factor.reason}</p>{project.factors.filter((item) => item.code === factor.code && item.reviewedBy).map((item) => <p key={item.code}>Проверил: {item.reviewedBy} · {date(item.reviewedAt!)}</p>)}{factor.evidenceIds.length ? <div className="evidence-links">{factor.evidenceIds.map((id, index) => <a key={id} href={`#evidence-${id}`}>Источник {index + 1}</a>)}</div> : null}</div><strong className={factor.counted ? "counted" : "not-counted"}>{factor.counted ? "+" : ""}{factor.points}</strong>
      </div>)}</div>
    </section>
    <section><h2>Проверка открытых реестров</h2>{!project.isDemo ? <ActionForm action={checkRegistryAction} label="Проверить открытый реестр"><input type="hidden" name="projectId" value={id}/><p>Homeportal: поиск разрешений, гарантий и опубликованных предупреждений. eQurylys: проверка организации по точному БИН. Результат сохраняется ниже; скоринг изменяется после проверки аналитиком.</p><AuthorField/></ActionForm> : <p>Для вымышленных объектов внешние запросы отключены.</p>}</section>
    <section><h2>Проверка дополнительных факторов</h2>{(["R4", "R5", "R6"] as const).map(code => <details key={code}><summary>{code} · {code === "R4" ? "Коллективное обращение" : code === "R5" ? "Расхождение готовности" : "Простой или просрочка"}</summary><DocumentFactorForm projectId={id} code={code}/></details>)}</section>
    <section aria-labelledby="evidence-heading"><div className="list-heading"><h2 id="evidence-heading">Сохранённые материалы</h2><span>{project.evidence.length} источников</span></div>
      <div className="evidence-list">{project.evidence.map((item) => <article id={`evidence-${item.id}`} key={item.id} className="evidence-item"><h3>{item.source}</h3><p>{item.text}</p><div className="evidence-meta"><span>Зафиксировано {date(item.capturedAt)} (Алматы)</span></div>{item.url ? <p className="source-url"><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></p> : null}</article>)}</div>
    </section>
    <section><h2>Сигнальные карточки</h2><SignalForm projectId={id}/><ul>{workflow.signals.map((signal) => <li key={signal.id}><Link href={`/signals/${signal.id}`}>Версия {signal.version} · {SIGNAL_STATUS[signal.status]}</Link> · {date(signal.created_at)}</li>)}</ul></section>
    <section><h2>История действий</h2>{workflow.events.length ? <ol className="audit-list">{workflow.events.map((event, index) => <li key={index}><strong>{event.action}</strong><p>{event.detail}</p><span>{event.actor} · {date(event.created_at)} (Алматы)</span></li>)}</ol> : <p>Пока нет действий.</p>}</section>
  </main>;
}

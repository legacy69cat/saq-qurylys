import { requireAccess } from "@/server/auth/access";
import Link from "next/link";
import { notFound } from "next/navigation";
import { databasePath, openDatabase } from "@/server/db/connection";
import { fingerprint, projectById, signalById } from "@/server/db/workflow";
import type { Project } from "@/server/db/projects";
import { InputError } from "@/domain/analysis";
import { formatDate, SIGNAL_STATUS } from "@/domain/display";
import { RiskBadge } from "@/components/risk-badge";
import { ActionForm, PrintButton } from "@/components/action-form";
import { AuthorField, SignalForm } from "@/components/workflow-forms";
import { reviewSignalAction } from "@/server/actions";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function SignalPage({ params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    await requireAccess();
    const { id } = await params;
    const db = (await openDatabase(databasePath(), { readOnly: true }));
    const data = await (async () => {
        try {
            const signal = (await signalById(db, id));
            return { signal, stale: signal.fingerprint !== fingerprint((await projectById(db, signal.project_id))) };
        }
        catch (error) {
            if (error instanceof InputError)
                notFound();
            throw error;
        }
        finally {
            db.close();
        }
    })();
    const { signal, stale } = data;
    const project = JSON.parse(signal.snapshot) as Project;
    return <main id="main" className="page detail-page signal-page">
    <Link className="back-link no-print" href={`/projects/${project.id}`}>Вернуться к ЖК</Link>
    <div className="page-title"><div><h1>Сигнальная карточка</h1><p>{project.name} · Версия {signal.version}</p></div><PrintButton /></div>
    <p className="notice">Сигнал определяет приоритет проверки и не устанавливает факт нарушения. Автоматическая отправка в государственные органы не выполняется.</p>
    <dl className="project-facts"><div><dt>Идентификатор сигнала</dt><dd>{signal.id}</dd></div><div><dt>Статус</dt><dd>{SIGNAL_STATUS[signal.status]}</dd></div><div><dt>Создан</dt><dd>{signal.created_by} · {formatDate(signal.created_at)} (Алматы)</dd></div>
      <div><dt>Объект</dt><dd>{project.name} · {project.address}</dd></div><div><dt>Застройщик / БИН</dt><dd>{project.developer} · {project.bin}</dd></div><div><dt>Приоритет проверки</dt><dd>{project.risk.score} / 100 · <RiskBadge zone={project.risk.zone}/></dd></div>
      <div><dt>Автор решения</dt><dd>{signal.reviewed_by || "Ещё не принято"}</dd></div><div><dt>Дата решения</dt><dd>{signal.reviewed_at ? `${formatDate(signal.reviewed_at)} (Алматы)` : "—"}</dd></div><div><dt>Версия правил</dt><dd>{project.risk.rulesVersion}</dd></div></dl>
    {signal.comment ? <p className="notice">Комментарий: {signal.comment}</p> : null}
    {stale ? <p className="notice">Текущие данные ЖК отличаются от сохранённого снимка. Эта версия отчёта остаётся неизменной.{signal.status === "pending" ? " Для подтверждения верните её и создайте новую версию." : ""}</p> : null}
    {project.risk.needsReview ? <p className="notice">В снимке есть непроверенные сведения. Неизвестные факторы не повышают балл.</p> : null}
    <section><h2>Факторы и подтверждения</h2><div className="factor-list">{project.risk.factors.map((factor) => <div className="factor-row" key={factor.code}><span>{factor.code}</span><div><h3>{factor.title}</h3><p>{factor.reason}</p>{project.factors.filter((item) => item.code === factor.code && item.reviewedBy).map((item) => <p key={item.code}>Проверил: {item.reviewedBy} · {formatDate(item.reviewedAt!)}</p>)}<div className="evidence-links">{factor.evidenceIds.map((evidenceId, index) => <a href={`#material-${evidenceId}`} key={evidenceId}>Материал {index + 1}</a>)}</div></div><strong>+{factor.points}</strong></div>)}</div></section>
    <section><h2>Материалы на момент создания</h2>{project.evidence.map((item) => <article className="evidence-item" id={`material-${item.id}`} key={item.id}><h3>{item.source}</h3><p>{item.text}</p><p>Зафиксировано: {formatDate(item.capturedAt)} (Алматы)</p>{item.url ? <p className="source-url"><a href={item.url} rel="noreferrer" target="_blank">{item.url}</a></p> : null}</article>)}</section>
    <section className="no-print"><h2>Решение аналитика</h2>{signal.status === "pending" ? <ActionForm action={reviewSignalAction} label="Сохранить решение по сигналу"><input type="hidden" name="signalId" value={id}/><label>Решение<select name="decision" defaultValue="" required><option value="" disabled>Выберите решение</option><option value="confirmed" disabled={stale}>Подтвердить</option><option value="returned">Вернуть на доработку</option></select></label><label>Комментарий (обязателен при возврате)<textarea name="comment" maxLength={2000} rows={3}/></label><AuthorField /></ActionForm> : <><p>Решение по этой версии зафиксировано. Для следующей подачи создайте новую версию.</p><SignalForm projectId={project.id}/></>}</section>
  </main>;
}

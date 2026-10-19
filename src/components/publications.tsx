import { assessAd } from "@/domain/ad-scoring";
import { AdAssessmentCard } from "./ad-assessment";
import type { Project } from "@/server/db/projects";
import type { workflowForProject } from "@/server/db/workflow";
import { ruleHypothesesAction, analyzeAction, manualHypothesisAction, reviewHypothesisAction } from "@/server/actions";
import { ActionForm } from "./action-form";
import { AuthorField, RequestId } from "./workflow-forms";
import { formatDate } from "@/domain/display";
const hypothesisLabels = { proposed: "Нужна проверка", confirmed: "Подтверждено", rejected: "Отклонено" };
export function Publications({ project, workflow, aiReady }: {
    project: Project;
    workflow: Awaited<ReturnType<typeof workflowForProject>>;
    aiReady: boolean;
}) {
    return <section id="publications" aria-labelledby="publications-heading"><h2 id="publications-heading">Рекламные публикации</h2>
    <p className="notice">{aiReady ? "ИИ предлагает гипотезы и цитаты. Балл меняется только после подтверждения человеком. По кнопке анализа текст и название ЖК передаются в Vercel AI Gateway." : "ИИ-анализ недоступен. Сохранение публикаций и ручная проверка доступны."}</p>
    {project.publications.toReversed().map((publication) => {
            const evidence = project.evidence.find((item) => item.id === publication.evidenceId);
            if (!evidence)
                return null;
            const suggestions = workflow.suggestions.filter((item) => item.publication_id === publication.id);
            const runs = workflow.runs.filter((item) => item.publication_id === publication.id);
            return <article className="publication-card" key={publication.id}>
        <h3>{publication.platform} · {publication.account}</h3>
        <p className="evidence-meta">Опубликовано: {formatDate(publication.publishedAt)} · Сохранено: {formatDate(evidence.capturedAt)}</p>
        <AdAssessmentCard text={evidence.text} publishedAt={publication.publishedAt}/><p className="source-text">{evidence.text}</p>
        {evidence.url ? <a href={evidence.url} target="_blank" rel="noreferrer">Открыть публикацию ↗</a> : null} · <a href={`#evidence-${evidence.id}`}>Сохранённый источник</a>
        {runs.map((run) => <div className="analysis-result" key={run.id}><p><strong>ИИ · {run.model}</strong> · {formatDate(run.created_at)}</p><p>{run.status === "running" ? "Анализ выполняется. Если запрос прерван, через 2 минуты можно повторить." : run.status === "failed" ? run.error : run.summary}</p></div>)}
        {!runs.some((run) => run.status === "completed") ? <details><summary>Анализировать публикацию с ИИ</summary><ActionForm action={analyzeAction} label="Запустить ИИ-анализ" pendingLabel="ИИ анализирует текст…"><input type="hidden" name="publicationId" value={publication.id}/><AuthorField /></ActionForm></details> : null}
        {assessAd(evidence.text).signals.length && !suggestions.some(s => s.id.startsWith(`rule-${publication.id}-`)) ? <details><summary>Сохранить найденные признаки как гипотезы</summary><ActionForm action={ruleHypothesesAction} label="Сохранить гипотезы по правилам"><input type="hidden" name="publicationId" value={publication.id}/><p>Цитаты подбираются автоматически. Балл ЖК изменится только после вашего решения по каждой гипотезе.</p><AuthorField /></ActionForm></details> : null}
        {suggestions.map((item) => <div className="hypothesis" key={item.id}>
          <h4>{item.code} · {item.origin === "ai" ? "Гипотеза ИИ" : "Ручная гипотеза"} · {hypothesisLabels[item.status]}</h4>
          <blockquote><mark>{item.quote}</mark></blockquote><p>{item.explanation}</p>
          {item.confidence !== null ? <p className="evidence-meta">Уверенность модели: {Math.round(item.confidence * 100)}%{item.confidence < .7 ? " · Неуверенный вывод" : ""}. Не является подтверждением.</p> : null}
          {item.reviewed_by ? <p className="evidence-meta">Решение: {item.reviewed_by} · {formatDate(item.reviewed_at!)}</p> : null}
          {item.status === "proposed" ? <ActionForm action={reviewHypothesisAction} label="Сохранить решение по гипотезе"><input type="hidden" name="hypothesisId" value={item.id}/><label>Решение<select name="decision" required defaultValue=""><option value="" disabled>Выберите решение</option><option value="confirmed">Подтвердить</option><option value="rejected">Отклонить</option></select></label><AuthorField /></ActionForm> : null}
        </div>)}
        <details><summary>Добавить гипотезу вручную</summary><ActionForm action={manualHypothesisAction} label="Сохранить ручную гипотезу">
          <RequestId /><input type="hidden" name="publicationId" value={publication.id}/>
          <label>Фактор<select name="code"><option value="R2">R2 · Прямое предложение внести деньги</option><option value="R3">R3 · Реклама строящегося жилья</option></select></label>
          <label>Дословная цитата<textarea name="quote" required rows={2} maxLength={2000}/></label><label>Объяснение<textarea name="explanation" required rows={2} maxLength={1500}/></label><AuthorField />
        </ActionForm></details>
      </article>;
        })}
  </section>;
}

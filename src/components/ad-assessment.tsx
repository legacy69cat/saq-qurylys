import { assessAd, type AdAssessment } from '@/domain/ad-scoring';
const labels = { review: 'Проверить вручную · неоднозначные условия', candidate: 'Проверить признаки', housing: 'Жильё · без явных признаков', other: 'Возможно нерелевантно', insufficient: 'Недостаточно текста' };
export function AdAssessmentCard({ text, publishedAt, truncated = false, assessment }: {
    text: string;
    assessment?: AdAssessment;
    publishedAt?: string | null;
    truncated?: boolean;
}) {
    const a = assessment ?? assessAd(text, { publishedAt, truncated });
    return <section className="ad-assessment" aria-label="Предварительная оценка объявления"><div className="collection-heading"><strong>{labels[a.category]}</strong><span className="ad-score">{a.category === 'insufficient' ? 'Нет оценки' : `${a.score} баллов`}</span></div><p className="muted">Только текстовые признаки R2/R3, максимум 35 баллов. Это не полный риск объекта.</p>{a.category === 'insufficient' ? <p className="notice">Откройте видео или изображение: текстового описания недостаточно для скоринга.</p> : null}{a.signals.map(s => <div key={s.code}><strong>{s.code} · +{s.points}</strong><blockquote>{s.quote}</blockquote><p>{s.reason}</p></div>)}{a.reasons.map(r => <p key={r}>{r}</p>)}<details><summary>Ограничения оценки</summary><ul>{a.warnings.map(w => <li key={w}>{w}</li>)}</ul><p>Текстовые правила {a.version}. Оценка по тексту; при распознавании снимка проверьте точность текста. 0 баллов не означает отсутствие риска.</p></details></section>;
}

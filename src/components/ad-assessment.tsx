import { assessAd } from '@/domain/ad-scoring';
const labels = { review: 'Проверить вручную · неоднозначные условия', candidate: 'Проверить признаки', housing: 'Жильё · без явных признаков', other: 'Возможно нерелевантно', insufficient: 'Недостаточно текста' };
export function AdAssessmentCard({ text, publishedAt, truncated = false }: {
    text: string;
    publishedAt?: string | null;
    truncated?: boolean;
}) {
    const a = assessAd(text, { publishedAt, truncated });
    return <section className="ad-assessment" aria-label="Предварительная оценка объявления"><div className="collection-heading"><strong>{labels[a.category]}</strong><span className="ad-score">{a.category === 'insufficient' ? 'Нет оценки' : `${a.score} / 35`}</span></div><p className="muted">Предварительные признаки R2/R3 · не подтверждённый балл ЖК</p>{a.category === 'insufficient' ? <p className="notice">Откройте видео или изображение: текстового описания недостаточно для скоринга.</p> : null}{a.signals.map(s => <div key={s.code}><strong>{s.code} · +{s.points}</strong><blockquote>{s.quote}</blockquote><p>{s.reason}</p></div>)}{a.reasons.map(r => <p key={r}>{r}</p>)}<details><summary>Ограничения оценки</summary><ul>{a.warnings.map(w => <li key={w}>{w}</li>)}</ul><p>Текстовые правила {a.version}. Без распознавания изображения и речи. 0 баллов не означает отсутствие риска.</p></details></section>;
}

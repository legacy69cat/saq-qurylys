import Link from 'next/link';
import { projectCandidates, type MatchableProject } from '@/domain/project-matching';
export function ProjectMatches({ text, projects }: {
    text: string;
    projects: MatchableProject[];
}) {
    const candidates = projectCandidates(text, projects);
    return <div className="project-matches">{candidates.length ? <><strong>Совпадения названия ЖК: {candidates.length}</strong><ul>{candidates.map(p => <li key={p.id}><Link href={`/projects/${p.id}`}>{p.name}</Link> · {p.address} · {p.developer}</li>)}</ul><p>Проверьте адрес и застройщика перед привязкой. Совпадение названия не подтверждает объект.</p></> : <p className="muted">Явного совпадения названия ЖК в реестре нет. Объект можно выбрать вручную после проверки.</p>}</div>;
}

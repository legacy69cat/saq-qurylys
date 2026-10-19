import Link from "next/link";
import { ANALYST_STEPS } from "@/domain/analyst-guide";
import { PrintButton } from "@/components/action-form";
export default function AnalystGuidePage() { return <main id="main" className="page detail-page"><Link href="/monitoring">← Мониторинг</Link><h1>Сценарий аналитика ДЭР</h1><p>Усть-Каменогорск: от публичного объявления до проверенного сигнала.</p><ol className="scenario-steps">{ANALYST_STEPS.map(s => <li key={s.title}><h2>{s.title.replace(/^\d+\. /, "")}</h2><p>{s.text}</p><Link href={s.href}>{s.label} →</Link></li>)}</ol><PrintButton /></main>; }

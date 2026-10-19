import type { Zone } from "@/domain/risk";
export const ZONE_LABELS: Record<Zone, string> = { green: "Зелёная", yellow: "Жёлтая", red: "Красная" };
export function RiskBadge({ zone }: {
    zone: Zone;
}) {
    return <span className={`risk-badge ${zone}`}><span className="risk-dot" aria-hidden="true"/>{ZONE_LABELS[zone]}</span>;
}

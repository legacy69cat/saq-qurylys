import type { DatabaseSync } from "node:sqlite";
import { calculateRisk, type Evidence, type Factor, type LegalBasis, type ProgressObservation, type RiskInput, type RiskResult } from "../../domain/risk";
import { DatabaseNotReadyError } from "./connection";

export interface Project {
  id: string;
  name: string;
  address: string;
  developer: string;
  bin: string;
  stage: RiskInput["stage"];
  scenario: string;
  isDemo: boolean;
  legalBasis: LegalBasis;
  evidence: (Evidence & { url: string | null })[];
  publications: { id: string; platform: string; account: string; publishedAt: string; evidenceId: string }[];
  progress: ProgressObservation[];
  risk: RiskResult;
}

type ProjectRow = { id: string; name: string; address: string; developer: string; bin: string; stage: RiskInput["stage"]; scenario: string; isDemo: number };

export function listProjects(db: DatabaseSync): Project[] {
  const schema = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
  if (!schema || !db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get()) throw new DatabaseNotReadyError();
  const rows = db.prepare(`SELECT p.id, p.name, p.address, d.name AS developer, d.bin, p.stage, p.scenario, p.is_demo AS isDemo
    FROM projects p JOIN developers d ON p.developer_id = d.id ORDER BY p.id`).all() as ProjectRow[];
  return rows.map((row) => {
    const evidence = db.prepare("SELECT id, source, text, url, captured_at AS capturedAt FROM evidence WHERE project_id = ? ORDER BY id").all(row.id) as unknown as Project["evidence"];
    const legalRow = db.prepare("SELECT basis_type AS type, status, evidence_id AS evidenceId, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt FROM legal_checks WHERE project_id = ?")
      .get(row.id) as (Omit<LegalBasis, "evidenceIds"> & { evidenceId: string | null }) | undefined;
    const legalBasis: LegalBasis = legalRow
      ? { ...legalRow, evidenceIds: legalRow.evidenceId ? [legalRow.evidenceId] : [] }
      : { type: "unknown", status: "unknown", reviewedBy: null, reviewedAt: null, evidenceIds: [] };
    const factorRows = db.prepare("SELECT id, code, status, reviewed_by AS reviewedBy, reviewed_at AS reviewedAt FROM factors WHERE project_id = ? ORDER BY code")
      .all(row.id) as (Omit<Factor, "evidenceIds"> & { id: string })[];
    const factors: Factor[] = factorRows.map((factor) => ({
      ...factor,
      evidenceIds: (db.prepare("SELECT evidence_id AS id FROM factor_evidence WHERE factor_id = ? ORDER BY evidence_id").all(factor.id) as { id: string }[]).map((item) => item.id),
    }));
    const progress = db.prepare("SELECT kind, percent, evidence_id AS evidenceId, observed_at AS observedAt FROM progress_observations WHERE project_id = ? ORDER BY observed_at, id")
      .all(row.id) as unknown as ProgressObservation[];
    const publications = db.prepare("SELECT id, platform, account, published_at AS publishedAt, evidence_id AS evidenceId FROM publications WHERE project_id = ? ORDER BY id")
      .all(row.id) as Project["publications"];
    return { ...row, isDemo: row.isDemo === 1, legalBasis, evidence, progress, publications,
      risk: calculateRisk({ stage: row.stage, legalBasis, evidence, factors, progress }) };
  });
}

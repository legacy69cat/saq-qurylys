import type { DatabaseSync } from "node:sqlite";

const initialSchema = `
CREATE TABLE reviewers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_demo INTEGER NOT NULL CHECK (is_demo IN (0, 1))
) STRICT;
CREATE TABLE developers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bin TEXT NOT NULL UNIQUE,
  is_demo INTEGER NOT NULL CHECK (is_demo IN (0, 1))
) STRICT;
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  developer_id TEXT NOT NULL REFERENCES developers(id),
  stage TEXT NOT NULL CHECK (stage IN ('construction', 'commissioned')),
  latitude REAL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL CHECK (longitude BETWEEN -180 AND 180),
  scenario TEXT NOT NULL,
  is_demo INTEGER NOT NULL CHECK (is_demo IN (0, 1)),
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('publication', 'legal', 'complaint', 'progress', 'delay')),
  source TEXT NOT NULL CHECK (length(trim(source)) > 0),
  url TEXT,
  text TEXT NOT NULL CHECK (length(trim(text)) > 0),
  captured_at TEXT NOT NULL,
  is_demo INTEGER NOT NULL CHECK (is_demo IN (0, 1)),
  UNIQUE (id, project_id)
) STRICT;
CREATE TABLE legal_checks (
  project_id TEXT PRIMARY KEY REFERENCES projects(id),
  basis_type TEXT NOT NULL CHECK (basis_type IN ('unknown', 'guarantee', 'mio_permission', 'other', 'none')),
  status TEXT NOT NULL CHECK (status IN ('unknown', 'present', 'absent')),
  evidence_id TEXT,
  reviewed_by TEXT REFERENCES reviewers(id),
  reviewed_at TEXT,
  CHECK (status = 'unknown' OR (evidence_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK ((status = 'unknown' AND basis_type = 'unknown') OR (status = 'absent' AND basis_type = 'none') OR (status = 'present' AND basis_type IN ('guarantee', 'mio_permission', 'other'))),
  FOREIGN KEY (evidence_id, project_id) REFERENCES evidence(id, project_id)
) STRICT;
CREATE TABLE publications (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  evidence_id TEXT NOT NULL UNIQUE REFERENCES evidence(id),
  platform TEXT NOT NULL,
  account TEXT NOT NULL,
  published_at TEXT NOT NULL,
  link_status TEXT NOT NULL CHECK (link_status IN ('unlinked', 'proposed', 'confirmed')),
  CHECK (link_status != 'confirmed' OR project_id IS NOT NULL),
  FOREIGN KEY (evidence_id, project_id) REFERENCES evidence(id, project_id)
) STRICT;
CREATE TABLE factors (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  code TEXT NOT NULL CHECK (code IN ('R1', 'R2', 'R3', 'R4', 'R5', 'R6')),
  status TEXT NOT NULL CHECK (status IN ('unknown', 'proposed', 'confirmed', 'rejected')),
  reviewed_by TEXT REFERENCES reviewers(id),
  reviewed_at TEXT,
  CHECK (status != 'confirmed' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  UNIQUE (project_id, code),
  UNIQUE (id, project_id)
) STRICT;
CREATE TABLE factor_evidence (
  factor_id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY (factor_id, evidence_id),
  FOREIGN KEY (factor_id, project_id) REFERENCES factors(id, project_id),
  FOREIGN KEY (evidence_id, project_id) REFERENCES evidence(id, project_id)
) STRICT;
CREATE TABLE progress_observations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL CHECK (kind IN ('claimed', 'verified')),
  percent REAL NOT NULL CHECK (percent BETWEEN 0 AND 100),
  evidence_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  FOREIGN KEY (evidence_id, project_id) REFERENCES evidence(id, project_id)
) STRICT;
CREATE INDEX evidence_project ON evidence(project_id);
CREATE INDEX publications_project ON publications(project_id);
CREATE INDEX progress_project ON progress_observations(project_id, kind, observed_at);
`;

export function migrate(db: DatabaseSync): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT");
    const existing = db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
    if (!existing) {
      db.exec(initialSchema);
      db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(1, new Date().toISOString());
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

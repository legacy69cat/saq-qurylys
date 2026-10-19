import type {Database as DatabaseSync} from './connection';
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
const workflowSchema = `
CREATE TABLE analysis_runs (
 id TEXT PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES publications(id),
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
 model TEXT NOT NULL, prompt_version TEXT NOT NULL, summary TEXT, error TEXT,
 actor TEXT NOT NULL, created_at TEXT NOT NULL, finished_at TEXT
) STRICT;
CREATE UNIQUE INDEX one_running_analysis ON analysis_runs(publication_id) WHERE status = 'running';
CREATE TABLE suggestions (
 id TEXT PRIMARY KEY, publication_id TEXT NOT NULL REFERENCES publications(id),
 run_id TEXT REFERENCES analysis_runs(id), code TEXT NOT NULL CHECK(code IN ('R2','R3')),
 quote TEXT NOT NULL, explanation TEXT NOT NULL,
 confidence REAL CHECK(confidence BETWEEN 0 AND 1), origin TEXT NOT NULL CHECK(origin IN ('ai','manual')),
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','confirmed','rejected')),
 reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(run_id, code)
) STRICT;
CREATE TABLE signals (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), version INTEGER NOT NULL,
 snapshot TEXT NOT NULL, fingerprint TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed','returned')),
 created_by TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, comment TEXT,
 UNIQUE(project_id, version)
) STRICT;
CREATE UNIQUE INDEX one_pending_signal ON signals(project_id) WHERE status = 'pending';
CREATE TABLE audit_events (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX audit_project ON audit_events(project_id, created_at);
`;
const socialSchema = `
CREATE TABLE social_searches (
 id TEXT PRIMARY KEY, city TEXT NOT NULL, keywords TEXT NOT NULL,
 platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram','facebook')),
 result_limit INTEGER NOT NULL CHECK(result_limit BETWEEN 1 AND 50),
 interval_hours INTEGER NOT NULL CHECK(interval_hours IN (6,12,24,48,168)),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), next_run_at TEXT NOT NULL,
 created_at TEXT NOT NULL, UNIQUE(city, keywords, platform)
) STRICT;
CREATE TABLE collection_jobs (
 id TEXT PRIMARY KEY, search_id TEXT NOT NULL REFERENCES social_searches(id),
 status TEXT NOT NULL CHECK(status IN ('queued','starting','running','succeeded','failed','uncertain')),
 actor TEXT NOT NULL, run_id TEXT UNIQUE, dataset_id TEXT,
 reserved_usd REAL NOT NULL DEFAULT 0.2, actual_usd REAL,
 received INTEGER NOT NULL DEFAULT 0, imported INTEGER NOT NULL DEFAULT 0, skipped INTEGER NOT NULL DEFAULT 0,
 error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX one_active_collection ON collection_jobs(search_id) WHERE status IN ('queued','starting','running','uncertain');
CREATE TABLE collected_posts (
 id TEXT PRIMARY KEY, platform TEXT NOT NULL, external_id TEXT NOT NULL,
 url TEXT NOT NULL, text TEXT NOT NULL, account TEXT NOT NULL, published_at TEXT,
 truncated INTEGER NOT NULL, first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
 UNIQUE(platform, external_id)
) STRICT;
CREATE TABLE collection_matches (
 post_id TEXT NOT NULL REFERENCES collected_posts(id), job_id TEXT NOT NULL REFERENCES collection_jobs(id),
 PRIMARY KEY(post_id, job_id)
) STRICT;
CREATE TABLE collector_state (id INTEGER PRIMARY KEY CHECK(id = 1), heartbeat TEXT NOT NULL) STRICT;
`;
export async function migrate(db: DatabaseSync): Promise<void> {
    (await db.exec("BEGIN IMMEDIATE"));
    try {
        (await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT"));
        const existing = (await db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get());
        if (!existing) {
            (await db.exec(initialSchema));
            (await db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(1, new Date().toISOString()));
        }
        if (!(await db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get())) {
            (await db.exec(workflowSchema));
            (await db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(2, new Date().toISOString()));
        }
        if (!(await db.prepare("SELECT version FROM schema_migrations WHERE version = 3").get())) {
            (await db.exec(socialSchema));
            (await db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(3, new Date().toISOString()));
        }
        if (!(await db.prepare("SELECT version FROM schema_migrations WHERE version = 4").get())) {
            (await db.exec(`CREATE TABLE project_sources (
        project_id TEXT PRIMARY KEY REFERENCES projects(id), source TEXT NOT NULL, url TEXT NOT NULL, captured_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE collected_links (
        post_id TEXT PRIMARY KEY REFERENCES collected_posts(id), publication_id TEXT NOT NULL REFERENCES publications(id), linked_by TEXT NOT NULL, linked_at TEXT NOT NULL
      ) STRICT;`));
            (await db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(4, new Date().toISOString()));
        }
        if (!(await db.prepare("SELECT version FROM schema_migrations WHERE version=5").get())) {
            (await db.exec(`CREATE TABLE geocode_cache(query TEXT PRIMARY KEY, results TEXT NOT NULL, captured_at TEXT NOT NULL) STRICT;
      CREATE TABLE location_searches(id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES collected_posts(id), address TEXT NOT NULL, city TEXT NOT NULL, results TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
      CREATE TABLE geocoder_state(id INTEGER PRIMARY KEY CHECK(id=1), last_request INTEGER NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL) STRICT;`));
            (await db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(5, new Date().toISOString()));
        }
        if (!(await db.prepare("SELECT version FROM schema_migrations WHERE version=6").get())) {
            (await db.exec(`CREATE TABLE auth_users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','analyst','viewer')), password_hash TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL) STRICT;
      CREATE TABLE auth_sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES auth_users(id), expires_at INTEGER NOT NULL) STRICT;
      CREATE INDEX auth_session_expiry ON auth_sessions(expires_at);
      CREATE TABLE auth_throttle(key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL) STRICT;
      CREATE TABLE auth_events(id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, created_at TEXT NOT NULL) STRICT;
      CREATE TABLE worker_lease(id INTEGER PRIMARY KEY CHECK(id=1), owner TEXT NOT NULL, expires_at INTEGER NOT NULL) STRICT;`));
            (await db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(6, new Date().toISOString()));
        }
        (await db.exec("COMMIT"));
    }
    catch (error) {
        (await db.exec("ROLLBACK"));
        throw error;
    }
}

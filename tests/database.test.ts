import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "../src/server/db/connection";
import { migrate } from "../src/server/db/migrations";
import { seedDemo } from "../src/server/db/seed";
import { listProjects } from "../src/server/db/projects";

let db: DatabaseSync;
beforeEach(() => { db = openDatabase(":memory:"); migrate(db); });
afterEach(() => db.close());

describe("schema and demo seed", () => {
  it("migrations can be rerun", () => {
    migrate(db);
    expect(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get()?.n).toBe(1);
  });
  it("provides eight complete demo projects, twelve ads and expected risks", () => {
    seedDemo(db);
    const projects = listProjects(db);
    expect(projects).toHaveLength(8);
    expect(projects.reduce((n, project) => n + project.publications.length, 0)).toBe(12);
    expect(projects.map((project) => [project.id, project.risk.score, project.risk.zone])).toEqual([
      ["demo-a", 35, "yellow"], ["demo-b", 70, "red"], ["demo-c", 10, "green"], ["demo-d", 65, "yellow"],
      ["demo-e", 0, "green"], ["demo-f", 100, "red"], ["demo-g", 35, "yellow"], ["demo-h", 10, "green"],
    ]);
    for (const project of projects) {
      expect(project.isDemo).toBe(true);
      expect(project.address).toContain("вымышленный");
      expect(project.bin).toMatch(/^DEMO-/);
      expect(project.progress).toHaveLength(2);
      expect(project.publications.length).toBeGreaterThan(0);
      for (const factor of project.risk.factors.filter((factor) => factor.counted)) {
        expect(factor.evidenceIds.length).toBeGreaterThan(0);
        for (const id of factor.evidenceIds) expect(project.evidence.some((item) => item.id === id && item.source && item.capturedAt)).toBe(true);
      }
    }
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it("rerunning seed neither duplicates data nor overwrites analyst edits", () => {
    seedDemo(db);
    db.prepare("UPDATE factors SET status = 'rejected' WHERE id = 'demo-a-R2'").run();
    db.prepare("UPDATE evidence SET text = 'Edited by analyst' WHERE id = 'demo-a-ad-1'").run();
    seedDemo(db);
    expect(listProjects(db)).toHaveLength(8);
    expect(db.prepare("SELECT COUNT(*) AS n FROM publications").get()?.n).toBe(12);
    expect(db.prepare("SELECT text FROM evidence WHERE id = 'demo-a-ad-1'").get()?.text).toBe("Edited by analyst");
    expect(listProjects(db)[0].risk.score).toBe(10);
  });
  it("prevents linking another project's evidence", () => {
    seedDemo(db);
    expect(() => db.prepare("INSERT INTO factor_evidence VALUES ('demo-a-R2', 'demo-b-ad-1', 'demo-a')").run()).toThrow();
  });
  it("prevents invalid readiness, factor codes and confirmed factors without reviewer", () => {
    seedDemo(db);
    expect(() => db.prepare("UPDATE progress_observations SET percent = 101").run()).toThrow();
    expect(() => db.prepare("UPDATE factors SET code = 'R7'").run()).toThrow();
    expect(() => db.prepare("UPDATE factors SET reviewed_by = NULL WHERE status = 'confirmed'").run()).toThrow();
  });
  it("rejects incompatible legal status and basis type", () => {
    seedDemo(db);
    expect(() => db.prepare("UPDATE legal_checks SET status = 'absent' WHERE basis_type = 'guarantee'").run()).toThrow();
  });
  it("rolls back a partially failed seed", () => {
    db.prepare("INSERT INTO developers VALUES ('collision', 'Demo', 'DEMO-000002', 1)").run();
    expect(() => seedDemo(db)).toThrow();
    expect(db.prepare("SELECT COUNT(*) AS n FROM projects").get()?.n).toBe(0);
    expect(db.prepare("SELECT COUNT(*) AS n FROM reviewers").get()?.n).toBe(0);
  });
  it("detects missing schema without silently creating demo data", () => {
    const blank = openDatabase(":memory:");
    try { expect(() => listProjects(blank)).toThrow("npm run db:setup"); }
    finally { blank.close(); }
  });
  it("persists data across connections and supports read-only access", () => {
    const folder = mkdtempSync(join(tmpdir(), "saq-test-"));
    const path = join(folder, "saq.sqlite");
    try {
      const writer = openDatabase(path, { create: true });
      try { migrate(writer); seedDemo(writer); } finally { writer.close(); }
      const reader = openDatabase(path, { readOnly: true });
      try {
        expect(listProjects(reader)).toHaveLength(8);
        expect(() => reader.exec("DELETE FROM projects")).toThrow();
      } finally { reader.close(); }
    } finally { rmSync(folder, { recursive: true, force: true }); }
  });
});

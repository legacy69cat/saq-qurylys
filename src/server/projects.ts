import "server-only";
import { databasePath, openDatabase } from "./db/connection";
import { listProjects } from "./db/projects";

export function getProjects() {
  const db = openDatabase(databasePath(), { readOnly: true });
  try { return listProjects(db); }
  finally { db.close(); }
}

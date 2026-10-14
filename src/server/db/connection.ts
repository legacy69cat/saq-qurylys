import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function databasePath(): string {
  // The SQLite file is runtime data, never part of the Next.js deployment bundle.
  return resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || "./data/saq.sqlite");
}

export class DatabaseNotReadyError extends Error {
  constructor() {
    super("База данных не подготовлена. Выполните npm run db:setup.");
    this.name = "DatabaseNotReadyError";
  }
}

export function openDatabase(path: string, options: { create?: boolean; readOnly?: boolean } = {}): DatabaseSync {
  if (path !== ":memory:") {
    if (options.create) mkdirSync(dirname(path), { recursive: true });
    else if (!existsSync(path)) throw new DatabaseNotReadyError();
  }
  const db = new DatabaseSync(path, { readOnly: options.readOnly ?? false });
  db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  if (!options.readOnly) db.exec("PRAGMA journal_mode = WAL;");
  return db;
}

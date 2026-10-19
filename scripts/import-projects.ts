import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { databasePath, openDatabase } from "../src/server/db/connection";
import { migrate } from "../src/server/db/migrations";
import { addProject } from "../src/server/db/registry";
const path = process.argv[2] || "data/real-projects.json";
const rows = JSON.parse(readFileSync(resolve(path), "utf8")) as Record<string, unknown>[];
if (!Array.isArray(rows) || rows.length > 200)
    throw new Error("Expected up to 200 sourced objects");
const db = (await openDatabase(databasePath(), { create: true }));
try {
    (await migrate(db));
    for (const row of rows)
        (await addProject(db, { ...row, requestId: row.id, actor: "Импорт публичного каталога" }));
    console.log(`Imported ${rows.length} objects; risk factors remain unconfirmed.`);
}
finally {
    db.close();
}

import { databasePath, openDatabase } from "../src/server/db/connection";
import { migrate } from "../src/server/db/migrations";
import { seedDemo } from "../src/server/db/seed";

const command = process.argv[2];
if (!["migrate", "seed", "setup"].includes(command)) throw new Error("Expected migrate, seed or setup");
const path = databasePath();
const db = openDatabase(path, { create: true });
try {
  if (command === "migrate" || command === "setup") migrate(db);
  if (command === "seed" || command === "setup") seedDemo(db);
  console.log(`Database ${command}: ${path}`);
  console.log(db.prepare("SELECT (SELECT COUNT(*) FROM projects) AS projects, (SELECT COUNT(*) FROM publications) AS publications").get());
} finally {
  db.close();
}

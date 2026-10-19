import "server-only";
import { databasePath, openDatabase } from "./db/connection";
import { listProjects } from "./db/projects";
export async function getProjects() {
    const db = (await openDatabase(databasePath(), { readOnly: true }));
    try {
        return (await listProjects(db)).filter(p => process.env.SAQ_DEMO_MODE === "1" || !p.isDemo);
    }
    finally {
        db.close();
    }
}

import { requireAccess } from "@/server/auth/access";
import { getProjects } from "@/server/projects";
import { DatabaseNotReadyError } from "@/server/db/connection";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
    await requireAccess();
    try {
        return Response.json({ projects: (await getProjects()) }, { headers: { "Cache-Control": "no-store" } });
    }
    catch (error) {
        if (error instanceof DatabaseNotReadyError)
            return Response.json({ error: "DATABASE_NOT_READY", message: error.message }, { status: 503 });
        console.error("Could not read projects", error);
        return Response.json({ error: "DATABASE_ERROR", message: "Не удалось загрузить реестр." }, { status: 500 });
    }
}

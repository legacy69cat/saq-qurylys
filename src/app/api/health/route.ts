import { requireAccess } from "@/server/auth/access";
import { getProjects } from "@/server/projects";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
    await requireAccess();
    try {
        const projects = (await getProjects());
        return Response.json({ status: "ok", projects: projects.length, publications: projects.reduce((sum, item) => sum + item.publications.length, 0) }, { headers: { "Cache-Control": "no-store" } });
    }
    catch {
        return Response.json({ status: "unavailable" }, { status: 503 });
    }
}

import { teachingCsv, teachingRows } from "@/core/teaching.ts";
import { ensureAccountsReady, requireAdmin } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";
import { SCENARIOS } from "@/scenarios/index.ts";
import { getProgressDb } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleRoute(async () => {
    await requireAdmin();
    const users = (await ensureAccountsReady()).listUsers();
    const rows = teachingRows(users, SCENARIOS, getProgressDb());
    if (new URL(req.url).searchParams.get("format") === "csv") {
      return new Response(teachingCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="learning-progress.csv"',
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json({ rows }, { headers: { "Cache-Control": "no-store" } });
  });
}

import { requireUser } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";
import { SCENARIOS } from "@/scenarios/index.ts";
import { getWorldManager } from "@/world/manager.ts";
import { evaluateScenario } from "@/world/observations.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { targetId } = await ctx.params;
    const manager = getWorldManager();
    const world = await manager.ensure(user.id, targetId);
    const observations = SCENARIOS.filter((s) => s.target === targetId).map((s) =>
      evaluateScenario(world, s, manager.progress),
    );
    return Response.json({ target_id: targetId, observations });
  });
}

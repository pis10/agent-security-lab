import { SCENARIOS } from "@/scenarios/index.ts";
import { handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";
import { evaluateScenario } from "@/world/observations.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const world = await getWorldManager().ensure(targetId);
    const observations = SCENARIOS.filter((s) => s.target === targetId).map((s) => evaluateScenario(world, s));
    return Response.json({ target_id: targetId, observations });
  });
}

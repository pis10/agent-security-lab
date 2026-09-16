import { loadScenarios } from "../../../../../src/scenarios/index.ts";
import { handleRoute } from "../../../../../src/web/api.ts";
import { getWorldManager } from "../../../../../src/world/manager.ts";
import { evaluateScenario } from "../../../../../src/world/observations.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const world = await getWorldManager().ensure(targetId);
    const observations = loadScenarios()
      .filter((s) => s.target === targetId)
      .map((s) => evaluateScenario(world, s));
    return Response.json({ target_id: targetId, observations });
  });
}

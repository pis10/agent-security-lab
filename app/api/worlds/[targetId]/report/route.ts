import { generateReport } from "../../../../../src/core/report.ts";
import { SINKS } from "../../../../../src/core/sinks.ts";
import { getScenario } from "../../../../../src/scenarios/index.ts";
import { handleRoute, notFound } from "../../../../../src/web/api.ts";
import { getWorldManager } from "../../../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const scenarioId = new URL(req.url).searchParams.get("scenario_id");
    if (!scenarioId) {
      throw notFound("missing scenario_id");
    }
    const world = await getWorldManager().ensure(targetId);
    const scenario = getScenario(scenarioId);
    if (scenario === null) {
      throw notFound(`unknown scenario ${scenarioId}`);
    }
    const sinkEvents = SINKS.received({ sessionId: targetId });
    const markdown = generateReport(scenario, targetId, world.tracer.events, sinkEvents);
    return new Response(markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  });
}

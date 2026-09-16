import { generateReport } from "@/core/report.ts";
import { SINKS } from "@/core/sinks.ts";
import { requireScenario } from "@/scenarios/index.ts";
import { badRequest, handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const scenarioId = new URL(req.url).searchParams.get("scenario_id");
    if (!scenarioId) {
      throw badRequest("missing scenario_id");
    }
    const scenario = requireScenario(scenarioId, targetId);
    const world = await getWorldManager().ensure(targetId);
    const sinkEvents = SINKS.received({ sessionId: targetId });
    const markdown = generateReport(scenario, targetId, world.tracer.events, sinkEvents);
    return new Response(markdown, {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  });
}

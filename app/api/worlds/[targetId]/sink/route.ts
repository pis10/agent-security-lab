import { SINKS } from "../../../../../src/core/sinks.ts";
import { handleRoute } from "../../../../../src/web/api.ts";
import { getWorldManager } from "../../../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    await getWorldManager().ensure(targetId);
    const channel = new URL(req.url).searchParams.get("channel");
    return Response.json(SINKS.received({ channel: channel ?? undefined, sessionId: targetId }));
  });
}

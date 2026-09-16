import { handleRoute } from "../../../../../src/web/api.ts";
import { getWorldManager } from "../../../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const world = await getWorldManager().ensure(targetId);
    if (world.target.simState === null || world.target.simState === undefined) {
      return Response.json({});
    }
    return Response.json(await world.target.simState(world.ctx));
  });
}

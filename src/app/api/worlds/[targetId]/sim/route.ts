import { requireUser } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { targetId } = await ctx.params;
    const world = await getWorldManager().ensure(user.id, targetId);
    return Response.json((await world.target.simState(world.ctx)) ?? {});
  });
}

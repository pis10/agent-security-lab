import { assertSameOrigin, requireUser } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { targetId } = await ctx.params;
    const world = await getWorldManager().clearChat(user.id, targetId);
    return Response.json(getWorldManager().snapshot(world));
  });
}

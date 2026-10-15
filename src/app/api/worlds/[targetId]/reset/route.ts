import { z } from "zod";
import { assertSameOrigin, requireUser } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

const EnsureWorldBody = z.object({ scenario_id: z.string().nullable().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { targetId } = await ctx.params;
    const body = await parseBody(req, EnsureWorldBody);
    const world = await getWorldManager().reset(user.id, targetId, body.scenario_id ?? null);
    return Response.json(getWorldManager().snapshot(world));
  });
}

import { z } from "zod";
import { handleRoute, parseBody } from "../../../../../src/web/api.ts";
import { getWorldManager } from "../../../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

const DefensesBody = z.object({ enabled_defenses: z.array(z.string()).default([]) });

export async function POST(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const body = await parseBody(req, DefensesBody);
    const world = await getWorldManager().setDefenses(targetId, body.enabled_defenses);
    return Response.json(getWorldManager().snapshot(world));
  });
}

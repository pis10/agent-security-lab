import { z } from "zod";
import { handleRoute, parseBody } from "../../../../../src/web/api.ts";
import { getWorldManager } from "../../../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

const EnsureWorldBody = z.object({ scenario_id: z.string().nullable().optional() });

export async function POST(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const body = await parseBody(req, EnsureWorldBody);
    // 通关进度是学习历史，不随世界重置清除；checklist 显示的是当前世界的实时判定。
    const world = await getWorldManager().reset(targetId, body.scenario_id ?? null);
    return Response.json(getWorldManager().snapshot(world));
  });
}

import { z } from "zod";
import { handleRoute, parseBody } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

const ActBody = z.object({
  action: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const body = await parseBody(req, ActBody);
    const result = await getWorldManager().act(targetId, body.action, body.args);
    return Response.json(result);
  });
}

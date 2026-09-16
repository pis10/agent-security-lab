import { z } from "zod";
import { handleRoute, parseBody } from "../../../../../src/web/api.ts";
import { getWorldManager } from "../../../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

const ChatBody = z.object({ message: z.string() });

export async function POST(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const body = await parseBody(req, ChatBody);
    const reply = await getWorldManager().chat(targetId, body.message);
    return Response.json({ reply });
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const { targetId } = await ctx.params;
    const world = await getWorldManager().ensure(targetId);
    return Response.json({ messages: [...world.messages] });
  });
}

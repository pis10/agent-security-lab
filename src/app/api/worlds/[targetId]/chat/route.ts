import { z } from "zod";
import { assertSameOrigin, requireUser } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

const ChatBody = z.object({ message: z.string() });

export async function POST(req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    const { targetId } = await ctx.params;
    const body = await parseBody(req, ChatBody);
    const reply = await getWorldManager().chat(user.id, targetId, body.message);
    return Response.json({ reply });
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ targetId: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { targetId } = await ctx.params;
    const world = await getWorldManager().ensure(user.id, targetId);
    return Response.json({ messages: [...world.messages] });
  });
}

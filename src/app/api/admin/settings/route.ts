import { z } from "zod";
import { assertSameOrigin, requireAdmin } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";
import { getProgressDb } from "@/world/manager.ts";

export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    await requireAdmin();
    const body = await parseBody(req, z.object({ answers_visible: z.boolean() }));
    getProgressDb().setAnswersVisible(body.answers_visible);
    return Response.json(body);
  });
}

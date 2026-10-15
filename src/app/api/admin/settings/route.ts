import { z } from "zod";
import { getSettingsDb } from "@/core/settings.ts";
import { assertSameOrigin, requireAdmin } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";

export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const body = await parseBody(req, z.object({ answers_visible: z.boolean() }));
    getSettingsDb().setAnswersVisible(body.answers_visible, admin.id);
    return Response.json(body);
  });
}

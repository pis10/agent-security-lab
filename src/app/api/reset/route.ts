import { assertSameOrigin, requireUser } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

/**重置本人的全部产品与通关进度。 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const user = await requireUser();
    await getWorldManager().resetUser(user.id);
    return Response.json({ ok: true });
  });
}

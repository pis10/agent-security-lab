import { z } from "zod";
import { BadRequestError } from "@/core/errors.ts";
import { adminUserView, assertSameOrigin, ensureAccountsReady, requireAdmin } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

const ActionBody = z.object({
  action: z.enum(["reset_password", "reset_progress", "disable", "enable", "grant_admin", "revoke_admin"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const userId = Number.parseInt((await ctx.params).userId, 10);
    if (!Number.isSafeInteger(userId)) throw new BadRequestError("账号 id 不合法");
    const { action } = await parseBody(req, ActionBody);
    const db = await ensureAccountsReady();
    if (action === "reset_password") {
      const { user, initialPassword } = await db.resetPassword(userId);
      return Response.json({ user: adminUserView(user), initial_password: initialPassword });
    }
    if (action === "reset_progress") {
      const user = db.getUser(userId);
      await getWorldManager().resetUser(userId);
      return Response.json({ user: adminUserView(user) });
    }
    if (action === "disable" && userId === admin.id) throw new BadRequestError("不能停用自己的账号");
    const user =
      action === "disable" || action === "enable"
        ? db.setDisabled(userId, action === "disable")
        : db.setAdmin(userId, action === "grant_admin");
    return Response.json({ user: adminUserView(user) });
  });
}

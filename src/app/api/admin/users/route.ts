import { z } from "zod";
import { adminUserView, assertSameOrigin, ensureAccountsReady, requireAdmin } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    await requireAdmin();
    const db = await ensureAccountsReady();
    return Response.json({ users: db.listUsers().map(adminUserView) });
  });
}

const CreateBody = z.object({
  username: z.string().max(64),
  display_name: z.string().max(64).optional(),
  is_admin: z.boolean().optional(),
});

/**建号：初始密码随机生成，只在这次响应里返回，由管理员转交本人。 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    await requireAdmin();
    const body = await parseBody(req, CreateBody);
    const db = await ensureAccountsReady();
    const { user, initialPassword } = await db.createUser({
      username: body.username,
      displayName: body.display_name,
      isAdmin: body.is_admin ?? false,
    });
    return Response.json({ user: adminUserView(user), initial_password: initialPassword });
  });
}

import { z } from "zod";
import { assertSameOrigin, currentTokenHash, ensureAccountsReady, publicUser, requireUser } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

const PasswordBody = z.object({ current_password: z.string().max(256), new_password: z.string().max(256) });

/**本人改密码；初始密码未改时也放行。成功后注销本人其它会话。 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const user = await requireUser({ allowMustChange: true });
    const body = await parseBody(req, PasswordBody);
    const db = await ensureAccountsReady();
    const updated = await db.changePassword(
      user.id,
      body.current_password,
      body.new_password,
      await currentTokenHash(),
    );
    return Response.json({ user: publicUser(updated) });
  });
}

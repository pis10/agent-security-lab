import { z } from "zod";
import { assertSameOrigin, ensureAccountsReady, publicUser, setSessionCookie } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

const LoginBody = z.object({ username: z.string().max(64), password: z.string().max(256) });

export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const body = await parseBody(req, LoginBody);
    const db = await ensureAccountsReady();
    const user = await db.verifyLogin(body.username, body.password);
    const { token } = db.createSession(user.id);
    await setSessionCookie(token, req);
    return Response.json({ user: publicUser(user) });
  });
}

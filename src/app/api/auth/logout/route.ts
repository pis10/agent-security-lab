import { assertSameOrigin, clearSessionCookie, ensureAccountsReady, sessionToken } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    (await ensureAccountsReady()).deleteSession(await sessionToken());
    await clearSessionCookie();
    return Response.json({ ok: true });
  });
}

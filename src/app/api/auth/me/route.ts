import { publicUser, requireUser } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => Response.json({ user: publicUser(await requireUser({ allowMustChange: true })) }));
}

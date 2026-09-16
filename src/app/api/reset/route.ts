import { handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

export async function POST() {
  return handleRoute(async () => {
    await getWorldManager().resetAll();
    return Response.json({ ok: true });
  });
}

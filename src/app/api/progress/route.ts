import { handleRoute } from "@/lib/http.ts";
import { getProgressDb } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => Response.json(getProgressDb().captured()));
}

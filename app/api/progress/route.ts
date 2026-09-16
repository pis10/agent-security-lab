import { handleRoute } from "../../../src/web/api.ts";
import { getProgressDb } from "../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => Response.json(getProgressDb().captured()));
}

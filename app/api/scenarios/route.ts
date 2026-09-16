import { loadScenarios } from "../../../src/scenarios/index.ts";
import { handleRoute } from "../../../src/web/api.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => Response.json(loadScenarios()));
}

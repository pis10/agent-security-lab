import { loadConfig } from "../../../src/lib/config.ts";
import { handleRoute } from "../../../src/web/api.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => Response.json({ llm_model: loadConfig().llmModel }));
}

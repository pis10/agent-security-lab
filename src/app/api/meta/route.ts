import { loadConfig } from "@/lib/config.ts";
import { handleRoute } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => Response.json({ llm_model: loadConfig().llmModel }));
}

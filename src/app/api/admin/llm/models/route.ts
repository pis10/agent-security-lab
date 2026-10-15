import { llmModels } from "@/core/llm.ts";
import { requireAdmin } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

/**内置厂商的模型目录（来自 Pi 包内清单）。 */
export async function GET(req: Request) {
  return handleRoute(async () => {
    await requireAdmin();
    const provider = new URL(req.url).searchParams.get("provider") ?? "";
    return Response.json({ models: llmModels(provider) });
  });
}

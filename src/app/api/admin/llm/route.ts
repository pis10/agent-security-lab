import { llmInputSchema, normalizeLlmInput, resetLlmRuntime } from "@/core/llm.ts";
import { getSettingsDb } from "@/core/settings.ts";
import { assertSameOrigin, requireAdmin } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";
import { llmSettingsView } from "@/lib/page-data.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    await requireAdmin();
    return Response.json({ settings: llmSettingsView() }, { headers: { "Cache-Control": "no-store" } });
  });
}

/**保存模型设置：Key 留空且服务不变时沿用旧 Key；保存后下一轮对话即用新配置。 */
export async function PUT(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    const admin = await requireAdmin();
    const body = await parseBody(req, llmInputSchema);
    const db = getSettingsDb();
    db.setLlm(normalizeLlmInput(body, db.llm()?.settings ?? null), admin.id);
    resetLlmRuntime();
    return Response.json({ settings: llmSettingsView() });
  });
}

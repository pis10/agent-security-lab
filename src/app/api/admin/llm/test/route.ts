import { llmInputSchema, normalizeLlmInput, testLlm } from "@/core/llm.ts";
import { getSettingsDb } from "@/core/settings.ts";
import { assertSameOrigin, requireAdmin } from "@/lib/auth.ts";
import { handleRoute, parseBody } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

/**用表单里尚未保存的配置发一次测试请求；不保存，也不影响正在使用的模型。 */
export async function POST(req: Request) {
  return handleRoute(async () => {
    assertSameOrigin(req);
    await requireAdmin();
    const body = await parseBody(req, llmInputSchema);
    const settings = normalizeLlmInput(body, getSettingsDb().llm()?.settings ?? null);
    return Response.json(await testLlm(settings));
  });
}

import { llmModels, llmProviders } from "@/core/llm.ts";
import { requirePageAdmin } from "@/lib/auth.ts";
import { catalogData, llmSettingsView } from "@/lib/page-data.ts";
import { ModelSettings } from "@/ui/ModelSettings";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 模型设置" };

export default async function Page() {
  const user = await requirePageAdmin("/admin/model");
  const { meta, progress, scenarios } = catalogData(user);
  const settings = llmSettingsView();
  const providers = llmProviders();
  const provider = settings?.kind === "builtin" ? settings.provider : (providers[0]?.id ?? "");
  return (
    <ModelSettings
      settings={settings}
      providers={providers}
      initialModels={llmModels(provider)}
      meta={meta}
      progress={progress}
      scenarioCount={scenarios.length}
    />
  );
}

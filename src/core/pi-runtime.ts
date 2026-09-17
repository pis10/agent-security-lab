/**Pi 模型：包内 builtin catalog；可选 ASL_MODELS_JSON。 */
import type { Api, Model, MutableModels } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { loadConfig } from "../lib/config.ts";
import { applyModelsJsonFile } from "./pi-models-json.ts";

export function createPiModels(modelsJsonPath: string | null = null): MutableModels {
  const models = builtinModels();
  if (modelsJsonPath) applyModelsJsonFile(models, modelsJsonPath);
  return models;
}

export function getPiModels(): MutableModels {
  const g = globalThis as { __aslPiModels?: MutableModels };
  if (!g.__aslPiModels) {
    g.__aslPiModels = createPiModels(loadConfig().modelsJsonPath);
  }
  return g.__aslPiModels;
}

export function resetPiModels(): void {
  const g = globalThis as { __aslPiModels?: MutableModels };
  delete g.__aslPiModels;
}

export function getConfiguredModel(): Model<Api> {
  const config = loadConfig();
  const model = getPiModels().getModel(config.llmProvider, config.llmModel);
  if (!model) {
    throw new Error(
      `未知模型：${config.llmProvider}/${config.llmModel}。请核对该厂商的模型 id，或在 ASL_MODELS_JSON 中声明。`,
    );
  }
  return model;
}

export async function requireLlm(): Promise<Model<Api>> {
  const model = getConfiguredModel();
  if ((await getPiModels().getAuth(model)) === undefined) {
    throw new Error(
      `当前模型 ${model.provider}/${model.id} 未配置可用的 API Key。请设置该厂商的原生环境变量，或在 ASL_MODELS_JSON 中提供 apiKey。参见 README。`,
    );
  }
  return model;
}

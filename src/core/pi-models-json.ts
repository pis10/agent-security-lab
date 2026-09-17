/**可选扩展：本项目 models.json 子集（自定义网关 / 本地模型）。 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  type Api,
  type ApiKeyAuth,
  createProvider,
  type Model,
  type MutableModels,
  type ProviderAuth,
} from "@earendil-works/pi-ai";
import * as anthropicMessages from "@earendil-works/pi-ai/api/anthropic-messages";
import * as openaiCompletions from "@earendil-works/pi-ai/api/openai-completions";

const CUSTOM_APIS = {
  "openai-completions": openaiCompletions,
  "anthropic-messages": anthropicMessages,
} as const;

type CustomApi = keyof typeof CUSTOM_APIS;

export interface ModelsJsonSubset {
  providers?: Record<
    string,
    {
      baseUrl?: string;
      api?: string;
      apiKey?: string;
      models?: Array<{ id?: string }>;
    }
  >;
}

function staticOrEnvApiKey(raw: string): ApiKeyAuth {
  return {
    name: "API key",
    resolve: async ({ ctx, signal }) => {
      signal.throwIfAborted();
      if (raw.startsWith("$")) {
        const envVar = raw.slice(1);
        const value = await ctx.env(envVar);
        if (value) return { auth: { apiKey: value }, source: envVar };
        return undefined;
      }
      if (raw === "") return undefined;
      return { auth: { apiKey: raw }, source: "models.json" };
    },
  };
}

function customModel(providerId: string, modelId: string, api: CustomApi, baseUrl: string): Model<Api> {
  return {
    id: modelId,
    name: modelId,
    api,
    provider: providerId,
    baseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128_000,
    maxTokens: 8192,
  };
}

/**解析本项目 models.json 子集。未知字段忽略。 */
export function parseModelsJsonSubset(raw: unknown): ModelsJsonSubset {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("models.json 须为对象");
  }
  return raw as ModelsJsonSubset;
}

export function applyModelsJson(models: MutableModels, spec: ModelsJsonSubset): void {
  for (const [id, provider] of Object.entries(spec.providers ?? {})) {
    if (!provider || typeof provider !== "object") {
      throw new Error(`models.json providers.${id} 无效`);
    }
    const baseUrl = provider.baseUrl?.replace(/\/$/, "");
    if (!baseUrl) throw new Error(`models.json providers.${id} 缺少 baseUrl`);
    const api = provider.api ?? "openai-completions";
    if (!(api in CUSTOM_APIS)) {
      throw new Error(
        `models.json providers.${id} 的 api 不受支持：${api}（仅 openai-completions / anthropic-messages）`,
      );
    }
    const modelIds = (provider.models ?? []).map((m) => m.id?.trim()).filter((m): m is string => !!m);
    if (modelIds.length === 0) {
      throw new Error(`models.json providers.${id} 至少需要一个 models[].id`);
    }
    const auth: ProviderAuth = { apiKey: staticOrEnvApiKey(provider.apiKey ?? "") };
    models.setProvider(
      createProvider({
        id,
        name: id,
        baseUrl,
        auth,
        models: modelIds.map((modelId) => customModel(id, modelId, api as CustomApi, baseUrl)),
        api: CUSTOM_APIS[api as CustomApi],
      }),
    );
  }
}

export function applyModelsJsonFile(models: MutableModels, filePath: string): void {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(`ASL_MODELS_JSON 指向的文件不存在：${abs}`);
  }
  applyModelsJson(models, parseModelsJsonSubset(JSON.parse(readFileSync(abs, "utf8")) as unknown));
}

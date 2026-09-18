/**可选扩展：本项目 models.json 子集（自定义网关 / 本地模型）。
 * api 仅支持 openai-completions / anthropic-messages；模型字段按 Pi 原生 Model 透传，缺省给最小默认。 */
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
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

const CUSTOM_APIS = {
  "openai-completions": openAICompletionsApi,
  "anthropic-messages": anthropicMessagesApi,
} as const;

type CustomApi = keyof typeof CUSTOM_APIS;

/**models.json 的模型条目：Pi 原生 Model 字段全可写，缺省按最小可用补。 */
export interface ModelsJsonModel {
  id?: string;
  name?: string;
  reasoning?: boolean;
  input?: Array<"text" | "image">;
  cost?: Model<Api>["cost"];
  contextWindow?: number;
  maxTokens?: number;
  thinkingLevelMap?: Model<Api>["thinkingLevelMap"];
  samplingParams?: Record<string, unknown>;
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
}

export interface ModelsJsonSubset {
  providers?: Record<
    string,
    {
      baseUrl?: string;
      api?: string;
      apiKey?: string;
      headers?: Record<string, string>;
      models?: ModelsJsonModel[];
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

function customModel(providerId: string, api: CustomApi, baseUrl: string, spec: ModelsJsonModel): Model<Api> {
  const id = spec.id?.trim() ?? "";
  return {
    id,
    name: spec.name ?? id,
    api,
    provider: providerId,
    baseUrl,
    reasoning: spec.reasoning ?? false,
    input: spec.input ?? ["text"],
    cost: spec.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: spec.contextWindow ?? 128_000,
    maxTokens: spec.maxTokens ?? 8192,
    ...(spec.thinkingLevelMap !== undefined ? { thinkingLevelMap: spec.thinkingLevelMap } : {}),
    ...(spec.samplingParams !== undefined ? { samplingParams: spec.samplingParams } : {}),
    ...(spec.headers !== undefined ? { headers: spec.headers } : {}),
    ...(spec.compat !== undefined ? { compat: spec.compat as Model<Api>["compat"] } : {}),
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
    const modelSpecs = (provider.models ?? []).filter((m) => m.id?.trim());
    if (modelSpecs.length === 0) {
      throw new Error(`models.json providers.${id} 至少需要一个 models[].id`);
    }
    const auth: ProviderAuth = { apiKey: staticOrEnvApiKey(provider.apiKey ?? "") };
    models.setProvider(
      createProvider({
        id,
        name: id,
        baseUrl,
        ...(provider.headers !== undefined ? { headers: provider.headers } : {}),
        auth,
        models: modelSpecs.map((spec) => customModel(id, api as CustomApi, baseUrl, spec)),
        api: CUSTOM_APIS[api as CustomApi](),
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

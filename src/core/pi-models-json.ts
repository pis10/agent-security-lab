/**自定义模型：本项目 models.json 子集，或 .env 里的 ASL_LLM_BASE_URL 单模型写法（自建网关 / 本地模型）。
 *
 * 协议实现、流式解析、工具调用都由 Pi 完成；这里只把配置翻译成 Pi 的 createProvider。
 * compat / headers / contextWindow / maxTokens / reasoning 原样交给 Pi 的 Model。
 */
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
import type { Config, Env } from "../lib/config.ts";

const CUSTOM_APIS = {
  "openai-completions": openaiCompletions,
  "anthropic-messages": anthropicMessages,
} as const;

type CustomApi = keyof typeof CUSTOM_APIS;

/**不校验 Key 的服务（如未开 --api-key 的 vLLM）。Pi 要求有凭据，用占位值，服务端忽略。 */
export const KEYLESS_API_KEY = "EMPTY";

/**透传给 Pi Model 的可选字段：provider 级为默认，model 级覆盖。 */
interface PassThrough {
  headers?: Record<string, string>;
  compat?: Record<string, unknown>;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
}

export interface ModelsJsonSubset {
  providers?: Record<
    string,
    PassThrough & {
      baseUrl?: string;
      api?: string;
      apiKey?: string;
      models?: Array<PassThrough & { id?: string; name?: string }>;
    }
  >;
}

/**`$VAR` 读环境变量（未设置则视为缺 Key）；字面量原样用；留空为免 Key 服务。 */
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
      if (raw === "") return { auth: { apiKey: KEYLESS_API_KEY }, source: "keyless" };
      return { auth: { apiKey: raw }, source: "models.json" };
    },
  };
}

function customModel(
  providerId: string,
  api: CustomApi,
  baseUrl: string,
  provider: PassThrough,
  m: PassThrough & { id: string; name?: string },
): Model<Api> {
  const headers = provider.headers || m.headers ? { ...provider.headers, ...m.headers } : undefined;
  const compat = provider.compat || m.compat ? { ...provider.compat, ...m.compat } : undefined;
  return {
    id: m.id,
    name: m.name ?? m.id,
    api,
    provider: providerId,
    baseUrl,
    reasoning: m.reasoning ?? provider.reasoning ?? false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: m.contextWindow ?? provider.contextWindow ?? 128_000,
    maxTokens: m.maxTokens ?? provider.maxTokens ?? 8192,
    ...(headers ? { headers } : {}),
    ...(compat ? { compat: compat as Model<Api>["compat"] } : {}),
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
    const entries = (provider.models ?? []).map((m) => ({ ...m, id: m.id?.trim() ?? "" })).filter((m) => m.id !== "");
    if (entries.length === 0) {
      throw new Error(`models.json providers.${id} 至少需要一个 models[].id`);
    }
    const auth: ProviderAuth = { apiKey: staticOrEnvApiKey(provider.apiKey ?? "") };
    models.setProvider(
      createProvider({
        id,
        name: id,
        baseUrl,
        auth,
        models: entries.map((m) => customModel(id, api as CustomApi, baseUrl, provider, m)),
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

/**.env 单模型写法折成一个 provider：ASL_LLM_BASE_URL 未设置时为 null。Key 只以 $ASL_LLM_API_KEY 引用。 */
export function envCustomProvider(
  config: Pick<Config, "llmProvider" | "llmModel" | "customLlm">,
  env: Env = process.env,
): ModelsJsonSubset | null {
  const custom = config.customLlm;
  if (custom === null) return null;
  return {
    providers: {
      [config.llmProvider]: {
        baseUrl: custom.baseUrl,
        api: custom.api,
        apiKey: env.ASL_LLM_API_KEY?.trim() ? "$ASL_LLM_API_KEY" : "",
        ...(custom.compat ? { compat: custom.compat } : {}),
        models: [{ id: config.llmModel }],
      },
    },
  };
}

/**Pi Models 单例：builtin catalog + 可选本项目 models.json 子集。 */
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
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { loadConfig } from "../lib/config.ts";

const CUSTOM_APIS = {
  "openai-completions": openaiCompletions,
  "anthropic-messages": anthropicMessages,
} as const;

type CustomApi = keyof typeof CUSTOM_APIS;

const PI_CATALOG_BASE = "https://pi.dev";
const CATALOG_TIMEOUT_MS = 4_000;

let customProviderIds = new Set<string>();
let catalogOnce: Promise<void> | null = null;

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
    customProviderIds.add(id);
  }
}

export function mergeModels(baseline: readonly Model<Api>[], extra: readonly Model<Api>[]): Model<Api>[] {
  const merged = [...baseline];
  for (const model of extra) {
    const index = merged.findIndex((entry) => entry.id === model.id);
    if (index >= 0) merged[index] = model;
    else merged.push(model);
  }
  return merged;
}

export function parseRemoteCatalog(providerId: string, value: unknown): Model<Api>[] {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && "models" in value && Array.isArray(value.models)
      ? value.models
      : typeof value === "object" && value !== null
        ? Object.values(value)
        : undefined;
  if (!entries) throw new Error(`pi.dev 目录格式无效：${providerId}`);
  return entries
    .filter((entry): entry is Model<Api> => typeof entry === "object" && entry !== null && "id" in entry)
    .map((model) => ({ ...model, provider: providerId }));
}

export function applyRemoteOverlay(models: MutableModels, providerId: string, extra: readonly Model<Api>[]): void {
  const provider = models.getProvider(providerId);
  if (!provider) return;
  const baseline = provider.getModels.bind(provider);
  models.setProvider({
    ...provider,
    getModels: () => mergeModels(baseline(), extra),
  });
}

/**拉取当前 provider 的 pi.dev 覆盖层。失败返回 null（调用方保持包内目录）。 */
export async function fetchRemoteCatalog(
  providerId: string,
  opts: { fetch?: typeof fetch; baseUrl?: string; timeoutMs?: number } = {},
): Promise<Model<Api>[] | null> {
  const fetchFn = opts.fetch ?? fetch;
  const base = (opts.baseUrl ?? PI_CATALOG_BASE).replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? CATALOG_TIMEOUT_MS;
  try {
    const resp = await fetchFn(`${base}/api/models/providers/${encodeURIComponent(providerId)}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.status === 404 || resp.status === 501) return [];
    if (!resp.ok) return null;
    return parseRemoteCatalog(providerId, await resp.json());
  } catch {
    return null;
  }
}

async function refreshConfiguredCatalog(models: MutableModels): Promise<void> {
  const providerId = loadConfig().llmProvider;
  if (customProviderIds.has(providerId)) return;
  if (!models.getProvider(providerId)) return;
  const extra = await fetchRemoteCatalog(providerId);
  if (extra === null) {
    console.warn(`pi.dev 模型目录不可用，继续使用包内目录（${providerId}）`);
    return;
  }
  applyRemoteOverlay(models, providerId, extra);
}

/**进程内拉一次：只覆盖当前 ASL_LLM_PROVIDER。超时或失败则用包内目录。 */
export function ensureRemoteCatalog(): Promise<void> {
  if (!catalogOnce) {
    catalogOnce = refreshConfiguredCatalog(getPiModels()).catch((err) => {
      console.warn("启动时拉取模型目录失败，使用包内目录", err);
    });
  }
  return catalogOnce;
}

function loadModelsJson(filePath: string): ModelsJsonSubset {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (!existsSync(abs)) {
    throw new Error(`ASL_MODELS_JSON 指向的文件不存在：${abs}`);
  }
  return parseModelsJsonSubset(JSON.parse(readFileSync(abs, "utf8")) as unknown);
}

export function createPiModels(modelsJsonPath: string | null = null): MutableModels {
  customProviderIds = new Set();
  const models = builtinModels();
  if (modelsJsonPath) {
    applyModelsJson(models, loadModelsJson(modelsJsonPath));
  }
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
  catalogOnce = null;
  customProviderIds = new Set();
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

export async function llmReady(): Promise<boolean> {
  try {
    await ensureRemoteCatalog();
    const model = getConfiguredModel();
    return (await getPiModels().getAuth(model)) !== undefined;
  } catch {
    return false;
  }
}

export async function requireLlm(): Promise<Model<Api>> {
  await ensureRemoteCatalog();
  const model = getConfiguredModel();
  if ((await getPiModels().getAuth(model)) === undefined) {
    throw new Error(
      `当前模型 ${model.provider}/${model.id} 未配置可用的 API Key。请设置该厂商的原生环境变量，或在 ASL_MODELS_JSON 中提供 apiKey。参见 README。`,
    );
  }
  return model;
}

/**模型配置：管理员在网页上保存到 settings.db，这里翻译成 Pi 的模型目录与请求参数。
 *
 * 内置厂商用 Pi 包内目录，Key 随每次请求传入；自建服务注册成 `custom` provider。
 * 协议实现、流式解析与工具调用都由 Pi 完成。设置保存后调用 resetLlmRuntime，下一轮对话即生效。
 */
import {
  type Api,
  type AssistantMessage,
  createProvider,
  type Model,
  type ModelThinkingLevel,
  type MutableModels,
  Type,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { z } from "zod";
import {
  LLM_KINDS,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmSettingsInput,
  type LlmSettingsView,
  type LlmTestResult,
  THINKING_LEVELS,
} from "../lib/contracts.ts";
import { BadRequestError, LlmNotConfiguredError } from "./errors.ts";
import { getSettingsDb, type StoredLlm } from "./settings.ts";

/**保存在 settings.db 的配置：比表单多了真实 Key，自建服务的 provider 固定为 custom。 */
export type LlmSettings = Omit<LlmSettingsInput, "api_key" | "clear_api_key"> & { api_key: string };

export const CUSTOM_PROVIDER = "custom";

/**不校验 Key 的服务（如未开 --api-key 的 vLLM）。Pi 要求有凭据，用占位值，服务端忽略。 */
export const KEYLESS_API_KEY = "EMPTY";

const CUSTOM_APIS = {
  "openai-completions": openAICompletionsApi(),
  "anthropic-messages": anthropicMessagesApi(),
} as const;

// ---------------------------------------------------------------- 内置目录

/**只需一个 API Key 就能用的厂商；OAuth、云凭据、地址模板类的厂商在网页上配不了。 */
const UNSUPPORTED_PROVIDERS = new Set(["amazon-bedrock", "google-vertex"]);

let catalog: MutableModels | null = null;
function builtinCatalog(): MutableModels {
  catalog ??= builtinModels();
  return catalog;
}

export function llmProviders(): LlmProviderInfo[] {
  const models = builtinCatalog();
  return models
    .getProviders()
    .filter((p) => {
      if (!p.auth.apiKey || UNSUPPORTED_PROVIDERS.has(p.id)) return false;
      const list = models.getModels(p.id);
      return list.length > 0 && list.every((m) => m.baseUrl && !m.baseUrl.includes("{"));
    })
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function llmModels(provider: string): LlmModelInfo[] {
  if (!llmProviders().some((p) => p.id === provider)) return [];
  return builtinCatalog()
    .getModels(provider)
    .map((m) => ({ id: m.id, name: m.name, reasoning: m.reasoning, context_window: m.contextWindow }));
}

// ---------------------------------------------------------------- 表单校验

const COMPAT_SCHEMA = z
  .object({
    maxTokensField: z.enum(["max_completion_tokens", "max_tokens"]).optional(),
    supportsStore: z.boolean().optional(),
    supportsDeveloperRole: z.boolean().optional(),
    thinkingFormat: z.enum(["openai", "deepseek", "qwen", "qwen-chat-template", "chat-template"]).optional(),
  })
  .strict();

export const llmInputSchema = z.object({
  kind: z.enum(LLM_KINDS),
  provider: z.string().trim().max(100),
  model: z.string().trim().min(1, "请填写模型").max(200),
  base_url: z.string().trim().max(500),
  api_key: z.string().max(4096).optional(),
  clear_api_key: z.boolean().optional(),
  thinking: z.enum(THINKING_LEVELS),
  temperature: z.number().min(0).max(2),
  context_window: z.number().int().min(1024).max(10_000_000),
  max_tokens: z.number().int().min(1).max(1_000_000),
  compat: COMPAT_SCHEMA,
  headers: z.record(z.string(), z.string()),
});

function parseBaseUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BadRequestError("服务地址不是合法 URL，例如 http://10.0.0.5:8000/v1");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BadRequestError("服务地址只支持 http / https");
  if (u.username || u.password) throw new BadRequestError("服务地址不要带用户名或密码，Key 请填在 API Key 里");
  return u.href.replace(/\/+$/, "");
}

function parseHeaders(raw: Record<string, string>): Record<string, string> {
  const entries = Object.entries(raw).map(([k, v]) => [k.trim(), v.trim()] as const);
  if (entries.length > 20) throw new BadRequestError("额外请求头最多 20 个");
  for (const [name, value] of entries) {
    if (!/^[A-Za-z0-9-]{1,100}$/.test(name)) throw new BadRequestError(`请求头名称不合法：${name}`);
    if (/[\r\n]/.test(value) || value.length > 2000) throw new BadRequestError(`请求头 ${name} 的值不合法`);
  }
  return Object.fromEntries(entries);
}

/**服务（协议 + 厂商 + 地址）不变时才沿用已保存的 Key，避免把旧 Key 发到新填的地址。 */
export function sameService(a: LlmSettings, b: Pick<LlmSettings, "kind" | "provider" | "base_url">): boolean {
  return a.kind === b.kind && a.provider === b.provider && a.base_url === b.base_url;
}

export function normalizeLlmInput(input: LlmSettingsInput, existing: LlmSettings | null): LlmSettings {
  const custom = input.kind !== "builtin";
  const model = input.model.trim();
  let provider = CUSTOM_PROVIDER;
  let baseUrl = "";
  if (custom) {
    baseUrl = parseBaseUrl(input.base_url);
    if (input.max_tokens >= input.context_window) throw new BadRequestError("最大输出须小于上下文长度");
  } else {
    provider = input.provider.trim();
    if (!llmProviders().some((p) => p.id === provider)) throw new BadRequestError(`不支持的内置厂商：${provider}`);
    if (!llmModels(provider).some((m) => m.id === model)) {
      throw new BadRequestError(`${provider} 的模型目录里没有 ${model}`);
    }
  }
  const typed = input.api_key?.trim() ?? "";
  const keep = existing && sameService(existing, { kind: input.kind, provider, base_url: baseUrl });
  const apiKey = typed || (input.clear_api_key ? "" : keep ? existing.api_key : "");
  if (!custom && apiKey === "") throw new BadRequestError("请填写 API Key");
  return {
    kind: input.kind,
    provider,
    model,
    base_url: baseUrl,
    api_key: apiKey,
    thinking: input.thinking,
    temperature: input.temperature,
    context_window: input.context_window,
    max_tokens: input.max_tokens,
    compat: input.kind === "openai-completions" ? COMPAT_SCHEMA.parse(input.compat) : {},
    headers: custom ? parseHeaders(input.headers) : {},
  };
}

export function llmView(stored: StoredLlm, updatedBy: string | null): LlmSettingsView {
  const { api_key, ...rest } = stored.settings;
  return {
    ...rest,
    api_key_set: api_key !== "",
    api_key_hint: api_key.length >= 8 ? api_key.slice(-4) : null,
    updated_at: stored.updated_at,
    updated_by: updatedBy,
  };
}

// ---------------------------------------------------------------- Pi 目录

function customModel(settings: LlmSettings): Model<Api> {
  const headers = Object.keys(settings.headers).length > 0 ? settings.headers : undefined;
  const compat = Object.keys(settings.compat).length > 0 ? settings.compat : undefined;
  return {
    id: settings.model,
    name: settings.model,
    api: settings.kind,
    provider: CUSTOM_PROVIDER,
    baseUrl: settings.base_url,
    // 选了思考级别才按推理模型发请求参数
    reasoning: settings.thinking !== "off",
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: settings.context_window,
    maxTokens: settings.max_tokens,
    ...(headers ? { headers } : {}),
    ...(compat ? { compat: compat as Model<Api>["compat"] } : {}),
  };
}

/**包内目录，加上自建服务（如有）。 */
export function createPiModels(settings: LlmSettings | null): MutableModels {
  const models = builtinModels();
  if (settings && settings.kind !== "builtin") {
    const apiKey = settings.api_key || KEYLESS_API_KEY;
    models.setProvider(
      createProvider({
        id: CUSTOM_PROVIDER,
        name: "自建服务",
        baseUrl: settings.base_url,
        auth: {
          apiKey: {
            name: "API key",
            resolve: async () => ({ auth: { apiKey }, source: settings.api_key ? "settings" : "keyless" }),
          },
        },
        models: [customModel(settings)],
        api: CUSTOM_APIS[settings.kind],
      }),
    );
  }
  return models;
}

/**内置厂商的 Key 随请求传入，优先于环境变量；自建服务的 Key 已在 provider 里。 */
function requestApiKey(settings: LlmSettings): string | undefined {
  return settings.kind === "builtin" && settings.api_key ? settings.api_key : undefined;
}

// ---------------------------------------------------------------- 运行时

interface Runtime {
  stored: StoredLlm | null;
  models: MutableModels;
}

function runtime(): Runtime {
  const g = globalThis as { __aslLlm?: Runtime };
  if (!g.__aslLlm) {
    const stored = getSettingsDb().llm();
    g.__aslLlm = { stored, models: createPiModels(stored?.settings ?? null) };
  }
  return g.__aslLlm;
}

/**设置保存后丢掉缓存；下一次请求按新配置重建。 */
export function resetLlmRuntime(): void {
  delete (globalThis as { __aslLlm?: Runtime }).__aslLlm;
}

/**当前进程的模型目录；测试可往里注册 faux provider。 */
export function getPiModels(): MutableModels {
  return runtime().models;
}

export function activeLlm(): LlmSettings | null {
  return runtime().stored?.settings ?? null;
}

/**页面上显示的 `provider/model`；未配置为 null。 */
export function llmLabel(): string | null {
  const s = activeLlm();
  return s ? `${s.provider}/${s.model}` : null;
}

function requireSettings(): LlmSettings {
  const s = activeLlm();
  if (!s) throw new LlmNotConfiguredError("管理员尚未配置模型");
  return s;
}

export function getConfiguredModel(): Model<Api> {
  const s = requireSettings();
  const model = getPiModels().getModel(s.provider, s.model);
  if (!model)
    throw new LlmNotConfiguredError(`模型目录里找不到 ${s.provider}/${s.model}，请管理员在模型设置中重新选择`);
  return model;
}

export async function requireLlm(): Promise<Model<Api>> {
  const model = getConfiguredModel();
  const apiKey = requestApiKey(requireSettings());
  if ((await getPiModels().getAuth(model, { apiKey })) === undefined) {
    throw new LlmNotConfiguredError(`模型 ${model.provider}/${model.id} 缺少 API Key，请管理员在模型设置中填写`);
  }
  return model;
}

/**每次请求现取，设置一改，下一次请求就用新 Key 与温度。 */
export function llmRequestOptions(): { apiKey?: string; temperature: number } {
  const s = requireSettings();
  const apiKey = requestApiKey(s);
  return apiKey ? { apiKey, temperature: s.temperature } : { temperature: s.temperature };
}

export function llmThinking(): ModelThinkingLevel {
  return requireSettings().thinking;
}

// ---------------------------------------------------------------- 测试连接

/**按错误文字归类，自检报告与测试连接共用。只用于展示与统计，不保证精确。 */
export function errorCategory(message: string): string {
  if (/malformed token|invalid signature|invalid_token|signature verification/i.test(message)) return "invalid_token";
  if (/context.{0,30}(length|window|limit)|maximum.{0,20}tokens|too many tokens/i.test(message)) return "context_limit";
  if (/auto.tool.choice|tool.{0,20}parser|tool.choice|enable.auto.tool/i.test(message)) return "tool_calling_config";
  if (/401|403|unauthorized|api.?key|authentication/i.test(message)) return "authentication";
  if (/429|rate.limit/i.test(message)) return "rate_limit";
  if (/timed? ?out|timeout|超时/i.test(message)) return "timeout";
  if (/fetch failed|ECONN|ENOTFOUND|网络|连接|服务不可用/i.test(message)) return "connection";
  return "other";
}

/**测试连接另外区分模型名填错与请求被取消。 */
function testErrorCategory(message: string): string {
  const base = errorCategory(message);
  if (base !== "other") return base;
  if (/404|not.found|does not exist|unknown model|模型目录里找不到/i.test(message)) return "model_not_found";
  if (/aborted/i.test(message)) return "timeout";
  if (/connection error|socket hang up|EAI_AGAIN|EHOSTUNREACH/i.test(message)) return "connection";
  return base;
}

function redact(message: string, secret: string): string {
  return secret.length >= 4 ? message.replaceAll(secret, "***") : message;
}

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  return cause instanceof Error ? `${err.message}: ${cause.message}` : err.message;
}

/**发一次带测试工具的请求：能否连通、是否按要求调用工具（自建服务最常见的问题是没开工具调用）。 */
export async function testLlm(settings: LlmSettings, timeoutMs = 30_000): Promise<LlmTestResult> {
  const label = `${settings.provider}/${settings.model}`;
  const started = Date.now();
  const fail = (message: string): LlmTestResult => ({
    ok: false,
    latency_ms: Date.now() - started,
    model: label,
    tool_call: false,
    reply: null,
    error: { category: testErrorCategory(message), message: redact(message, settings.api_key).slice(0, 500) },
  });
  let message: AssistantMessage;
  try {
    const models = createPiModels(settings);
    const model = models.getModel(settings.provider, settings.model);
    if (!model) return fail(`模型目录里找不到 ${label}`);
    const apiKey = requestApiKey(settings);
    message = await models.completeSimple(
      model,
      {
        systemPrompt: "你在协助做连通性测试。用户要求调用工具时，直接调用，不要解释。",
        messages: [{ role: "user", content: "请调用 ping 工具，参数 value 填 42。", timestamp: Date.now() }],
        tools: [
          {
            name: "ping",
            description: "连通性测试工具，原样返回 value。",
            parameters: Type.Object({ value: Type.Number() }),
          },
        ],
      },
      {
        ...(apiKey ? { apiKey } : {}),
        temperature: settings.temperature,
        reasoning: settings.thinking === "off" ? undefined : settings.thinking,
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
  } catch (err) {
    return fail(errorText(err));
  }
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    return fail(message.errorMessage ?? (message.stopReason === "aborted" ? "请求超时" : "请求失败"));
  }
  const text = message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
  return {
    ok: true,
    latency_ms: Date.now() - started,
    model: label,
    tool_call: message.content.some((c) => c.type === "toolCall" && c.name === "ping"),
    reply: text ? text.slice(0, 200) : null,
    error: null,
  };
}

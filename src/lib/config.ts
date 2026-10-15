/**环境变量配置。PROJECT_ROOT 是 process.cwd()（compose 里即容器工作目录）。 */
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";

export const PROJECT_ROOT = process.cwd();

/**环境变量表；测试可传普通对象。 */
export type Env = Record<string, string | undefined>;

const THINKING_LEVELS = new Set<ModelThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/**.env 单模型写法：设置 ASL_LLM_BASE_URL 即启用。协议与兼容开关交给 Pi。 */
export interface CustomLlm {
  baseUrl: string;
  api: string;
  compat: Record<string, unknown> | null;
}

export interface Config {
  llmProvider: string;
  llmModel: string;
  thinkingLevel: ModelThinkingLevel;
  llmTemperature: number;
  modelsJsonPath: string | null;
  customLlm: CustomLlm | null;
  port: number;
  maxConcurrentTurns: number;
  turnTimeoutMs: number;
  worldIdleMs: number;
}

let cached: Config | null = null;

function parseThinkingLevel(raw: string | undefined): ModelThinkingLevel {
  const value = (raw ?? "off").trim() as ModelThinkingLevel;
  if (!THINKING_LEVELS.has(value)) {
    throw new Error(`ASL_LLM_THINKING 无效：${raw}。可选 off / minimal / low / medium / high / xhigh / max。`);
  }
  return value;
}

function parseCompat(raw: string | undefined): Record<string, unknown> | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`ASL_LLM_COMPAT 不是合法 JSON：${text}`);
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error('ASL_LLM_COMPAT 须为 JSON 对象，如 {"maxTokensField":"max_tokens"}');
  }
  return value as Record<string, unknown>;
}

function parseCustomLlm(env: Env): CustomLlm | null {
  const baseUrl = env.ASL_LLM_BASE_URL?.trim() ?? "";
  if (baseUrl === "") return null;
  if (!env.ASL_LLM_MODEL?.trim()) {
    throw new Error("设置了 ASL_LLM_BASE_URL 时须同时设置 ASL_LLM_MODEL（服务端的模型名）。");
  }
  return {
    baseUrl,
    api: env.ASL_LLM_API?.trim() || "openai-completions",
    compat: parseCompat(env.ASL_LLM_COMPAT),
  };
}

function positiveInt(env: Env, key: string, fallback: number): number {
  const value = Number(env[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
    throw new Error(`${key} 须为正整数（不超过 2147483647）`);
  return value;
}

export function loadConfig(env: Env = process.env): Config {
  if (cached) return cached;
  const modelsJson = env.ASL_MODELS_JSON?.trim() ?? "";
  const customLlm = parseCustomLlm(env);
  cached = {
    llmProvider: env.ASL_LLM_PROVIDER?.trim() || (customLlm ? "custom" : "zai-coding-cn"),
    llmModel: env.ASL_LLM_MODEL?.trim() || "glm-5.3-flash",
    thinkingLevel: parseThinkingLevel(env.ASL_LLM_THINKING),
    llmTemperature: Number.parseFloat(env.ASL_LLM_TEMPERATURE || "0.3"),
    modelsJsonPath: modelsJson === "" ? null : modelsJson,
    customLlm,
    port: Number.parseInt(env.PORT || "8600", 10),
    maxConcurrentTurns: positiveInt(env, "ASL_MAX_CONCURRENT_TURNS", 4),
    turnTimeoutMs: positiveInt(env, "ASL_TURN_TIMEOUT_MS", 120_000),
    worldIdleMs: positiveInt(env, "ASL_WORLD_IDLE_MS", 900_000),
  };
  return cached;
}

/**测试用：丢掉缓存。 */
export function resetConfigCache(): void {
  cached = null;
}

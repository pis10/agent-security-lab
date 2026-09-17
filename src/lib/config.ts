/**环境变量配置。PROJECT_ROOT 是 process.cwd()（compose 里即容器工作目录）。 */
import type { ModelThinkingLevel } from "@earendil-works/pi-ai";

export const PROJECT_ROOT = process.cwd();

const THINKING_LEVELS = new Set<ModelThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

export interface Config {
  llmProvider: string;
  llmModel: string;
  thinkingLevel: ModelThinkingLevel;
  llmTemperature: number;
  modelsJsonPath: string | null;
  port: number;
}

let cached: Config | null = null;

function parseThinkingLevel(raw: string | undefined): ModelThinkingLevel {
  const value = (raw ?? "off").trim() as ModelThinkingLevel;
  if (!THINKING_LEVELS.has(value)) {
    throw new Error(`ASL_LLM_THINKING 无效：${raw}。可选 off / minimal / low / medium / high / xhigh / max。`);
  }
  return value;
}

export function loadConfig(): Config {
  if (cached) return cached;
  const modelsJson = process.env.ASL_MODELS_JSON?.trim() ?? "";
  cached = {
    llmProvider: process.env.ASL_LLM_PROVIDER?.trim() || "zai-coding-cn",
    llmModel: process.env.ASL_LLM_MODEL?.trim() || "glm-5.3-flash",
    thinkingLevel: parseThinkingLevel(process.env.ASL_LLM_THINKING),
    llmTemperature: Number.parseFloat(process.env.ASL_LLM_TEMPERATURE || "0.3"),
    modelsJsonPath: modelsJson === "" ? null : modelsJson,
    port: Number.parseInt(process.env.PORT || "8600", 10),
  };
  return cached;
}

/**测试用：丢掉缓存。 */
export function resetConfigCache(): void {
  cached = null;
}

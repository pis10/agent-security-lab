/**环境变量配置。PROJECT_ROOT 是 process.cwd()（compose 里即容器工作目录）。 */

export const PROJECT_ROOT = process.cwd();

export interface Config {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  /** GLM thinking：disabled / enabled / 空串（不发送该字段） */
  llmThinking: string;
  llmTemperature: number;
  port: number;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  cached = {
    llmBaseUrl: process.env.ASL_LLM_BASE_URL || "https://open.bigmodel.cn/api/coding/paas/v4",
    llmApiKey: process.env.ASL_LLM_API_KEY || "",
    llmModel: process.env.ASL_LLM_MODEL || "glm-5.3-flash",
    llmThinking: process.env.ASL_LLM_THINKING ?? "disabled",
    llmTemperature: Number.parseFloat(process.env.ASL_LLM_TEMPERATURE || "0.3"),
    port: Number.parseInt(process.env.PORT || "8600", 10),
  };
  return cached;
}

export function llmAvailable(config: Config): boolean {
  return config.llmApiKey !== "";
}

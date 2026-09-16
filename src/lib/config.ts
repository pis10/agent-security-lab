/**配置：全部来自环境变量（Next dev/standalone 会自动加载 .env，Docker 由 compose 注入）。
 *
 * PROJECT_ROOT 用 process.cwd()：`next dev` 下是仓库根目录；standalone 运行时
 * （node server.js）是 .next/standalone，data/ 目录相对它解析，与 Docker 布局一致。
 * 端口走标准 PORT 环境变量（standalone server.js 与 `next dev --port` 都读它）。
 */

export const PROJECT_ROOT = process.cwd();

export interface Config {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  /** GLM 思考模式：disabled=快而直接（靶场默认）；enabled=带推理；空串=不发送该参数 */
  llmThinking: string;
  /**低温采样：目标 Agent 对同类请求的行为稳定，靶场判定不随采样方差抖动 */
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

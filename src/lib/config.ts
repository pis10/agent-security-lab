/**配置加载：.env + 环境变量。
 *
 * PROJECT_ROOT 用 process.cwd()：`next dev` 下是仓库根目录；standalone 运行时
 * （node server.js）是 .next/standalone，data/ 目录相对它解析，与 Docker 布局一致。
 * 旧版的 ASL_HOST/ASL_PORT 是 uvicorn 绑定参数，已随 Python 栈移除；端口统一
 * 走标准 PORT 环境变量（standalone server.js 与 `next dev --port` 都读它）。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const PROJECT_ROOT = process.cwd();

/** Minimal .env loader (no dependency). Does not override real env vars. */
function loadDotenv(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const eq = line.indexOf("=");
    const key = line.slice(0, eq).trim();
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

export interface Config {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  /** GLM 思考模式：disabled=快且直接（靶场默认）；enabled=带推理；空串=不发送该参数 */
  llmThinking: string;
  /** 低温采样：目标 Agent 对同类请求的行为稳定，靶场判定不随采样方差抖动 */
  llmTemperature: number;
  port: number;
}

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  loadDotenv(path.join(PROJECT_ROOT, ".env"));
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

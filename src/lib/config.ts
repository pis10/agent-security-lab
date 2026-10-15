/**部署参数（环境变量）。模型在网页上由管理员配置，见 core/llm.ts。
 *
 * PROJECT_ROOT 是 process.cwd()（compose 里即容器工作目录）。
 */
export const PROJECT_ROOT = process.cwd();

/**环境变量表；测试可传普通对象。 */
export type Env = Record<string, string | undefined>;

export interface Config {
  port: number;
  maxConcurrentTurns: number;
  turnTimeoutMs: number;
  worldIdleMs: number;
}

let cached: Config | null = null;

function positiveInt(env: Env, key: string, fallback: number): number {
  const value = Number(env[key] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)
    throw new Error(`${key} 须为正整数（不超过 2147483647）`);
  return value;
}

export function loadConfig(env: Env = process.env): Config {
  if (cached) return cached;
  cached = {
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

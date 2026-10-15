import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { loadConfig, resetConfigCache } from "../lib/config.ts";

afterEach(() => resetConfigCache());

test("模型容量与回收参数有合理默认值，拒绝零、负数、NaN 与超出定时器范围的值", () => {
  const config = loadConfig({});
  assert.equal(config.port, 8600);
  assert.equal(config.maxConcurrentTurns, 4);
  assert.equal(config.turnTimeoutMs, 120_000);
  assert.equal(config.worldIdleMs, 900_000);
  for (const name of ["ASL_MAX_CONCURRENT_TURNS", "ASL_TURN_TIMEOUT_MS", "ASL_WORLD_IDLE_MS"]) {
    for (const value of ["0", "-1", "NaN", "1.5", "2147483648"]) {
      resetConfigCache();
      assert.throws(() => loadConfig({ [name]: value }), /须为正整数/);
    }
  }
});

test("模型不再从环境变量读取", () => {
  const config = loadConfig({ ASL_LLM_PROVIDER: "openai", ASL_LLM_MODEL: "gpt", ASL_LLM_BASE_URL: "http://x" });
  assert.deepEqual(Object.keys(config).sort(), ["maxConcurrentTurns", "port", "turnTimeoutMs", "worldIdleMs"]);
});

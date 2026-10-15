import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { loadConfig, resetConfigCache } from "../lib/config.ts";

afterEach(() => resetConfigCache());

test("未设置 ASL_LLM_BASE_URL 时走 Pi 内建厂商", () => {
  const config = loadConfig({});
  assert.equal(config.customLlm, null);
  assert.equal(config.llmProvider, "zai-coding-cn");
});

test("ASL_LLM_BASE_URL 启用自定义模型，provider 默认 custom，协议默认 openai-completions", () => {
  const config = loadConfig({ ASL_LLM_BASE_URL: "http://10.0.0.5:8000/v1", ASL_LLM_MODEL: "qwen3-32b" });
  assert.equal(config.llmProvider, "custom");
  assert.equal(config.llmModel, "qwen3-32b");
  assert.deepEqual(config.customLlm, { baseUrl: "http://10.0.0.5:8000/v1", api: "openai-completions", compat: null });
});

test("ASL_LLM_COMPAT 解析为对象，非法时报错", () => {
  const config = loadConfig({
    ASL_LLM_BASE_URL: "http://llm.example",
    ASL_LLM_MODEL: "m",
    ASL_LLM_API: "anthropic-messages",
    ASL_LLM_COMPAT: '{"supportsTemperature":false}',
  });
  assert.equal(config.customLlm?.api, "anthropic-messages");
  assert.deepEqual(config.customLlm?.compat, { supportsTemperature: false });
  resetConfigCache();
  assert.throws(
    () => loadConfig({ ASL_LLM_BASE_URL: "http://x", ASL_LLM_MODEL: "m", ASL_LLM_COMPAT: "{bad" }),
    /不是合法 JSON/,
  );
  assert.throws(
    () => loadConfig({ ASL_LLM_BASE_URL: "http://x", ASL_LLM_MODEL: "m", ASL_LLM_COMPAT: "[]" }),
    /JSON 对象/,
  );
});

test("设置 ASL_LLM_BASE_URL 却缺 ASL_LLM_MODEL 时报错", () => {
  assert.throws(() => loadConfig({ ASL_LLM_BASE_URL: "http://x" }), /ASL_LLM_MODEL/);
});

import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";
import type { LlmSettingsInput } from "../lib/contracts.ts";
import { httpErrorOf } from "./errors.ts";
import {
  activeLlm,
  getConfiguredModel,
  type LlmSettings,
  llmLabel,
  llmModels,
  llmProviders,
  llmRequestOptions,
  llmView,
  normalizeLlmInput,
  requireLlm,
  resetLlmRuntime,
} from "./llm.ts";
import { installTestLlm } from "./llm-testing.ts";

const BASE: LlmSettingsInput = {
  kind: "openai-completions",
  provider: "",
  model: "qwen3-32b",
  base_url: "http://10.0.0.5:8000/v1/",
  thinking: "off",
  temperature: 0.3,
  context_window: 32_768,
  max_tokens: 4096,
  compat: { maxTokensField: "max_tokens" },
  headers: {},
};

test("内置目录只列一个 Key 就能用的厂商", () => {
  const ids = llmProviders().map((p) => p.id);
  for (const id of ["zai-coding-cn", "openai", "anthropic", "deepseek"]) assert.ok(ids.includes(id), id);
  for (const id of ["amazon-bedrock", "google-vertex", "openai-codex", "cloudflare-workers-ai", "azure"]) {
    assert.ok(!ids.includes(id), id);
  }
  assert.ok(llmModels("zai-coding-cn").some((m) => m.id === "glm-5.3-flash"));
  assert.deepEqual(llmModels("amazon-bedrock"), []);
  assert.deepEqual(llmModels("nope"), []);
});

test("自建服务：地址去掉结尾斜杠，provider 固定 custom，兼容开关只给 OpenAI 协议", () => {
  const s = normalizeLlmInput({ ...BASE, api_key: " sk-local " }, null);
  assert.equal(s.provider, "custom");
  assert.equal(s.base_url, "http://10.0.0.5:8000/v1");
  assert.equal(s.api_key, "sk-local");
  assert.deepEqual(s.compat, { maxTokensField: "max_tokens" });
  const anthropic = normalizeLlmInput({ ...BASE, kind: "anthropic-messages" }, null);
  assert.deepEqual(anthropic.compat, {});
  assert.equal(anthropic.api_key, "");
});

test("自建服务的非法输入给出可读错误", () => {
  const bad: Array<[Partial<LlmSettingsInput>, RegExp]> = [
    [{ base_url: "10.0.0.5:8000" }, /http/],
    [{ base_url: "ftp://10.0.0.5/v1" }, /http/],
    [{ base_url: "http://user:pass@10.0.0.5/v1" }, /用户名或密码/],
    [{ max_tokens: 40_000 }, /小于上下文/],
    [{ headers: { "Bad Header": "x" } }, /请求头名称/],
    [{ headers: { "X-A": "line\nbreak" } }, /X-A/],
  ];
  for (const [patch, pattern] of bad) {
    assert.throws(() => normalizeLlmInput({ ...BASE, ...patch }, null), pattern, JSON.stringify(patch));
  }
});

test("内置厂商：厂商与模型须在目录里，且必须有 Key", () => {
  const builtin = { ...BASE, kind: "builtin" as const, provider: "zai-coding-cn", model: "glm-5.3-flash" };
  assert.throws(() => normalizeLlmInput(builtin, null), /API Key/);
  assert.throws(() => normalizeLlmInput({ ...builtin, provider: "amazon-bedrock", api_key: "k" }, null), /不支持/);
  assert.throws(() => normalizeLlmInput({ ...builtin, model: "gpt-x", api_key: "k" }, null), /没有 gpt-x/);
  const s = normalizeLlmInput({ ...builtin, api_key: "zk-123456789" }, null);
  assert.equal(s.base_url, "");
  assert.deepEqual(s.compat, {});
  assert.deepEqual(s.headers, {});
});

test("Key 留空时只在服务不变时沿用；换地址或厂商不会把旧 Key 发到新服务", () => {
  const saved = normalizeLlmInput({ ...BASE, api_key: "sk-old-123456" }, null);
  assert.equal(normalizeLlmInput({ ...BASE, model: "qwen3-8b" }, saved).api_key, "sk-old-123456");
  assert.equal(normalizeLlmInput({ ...BASE, base_url: "http://evil.example/v1" }, saved).api_key, "");
  assert.equal(normalizeLlmInput({ ...BASE, kind: "anthropic-messages" }, saved).api_key, "");
  assert.equal(normalizeLlmInput({ ...BASE, clear_api_key: true }, saved).api_key, "");
  assert.equal(normalizeLlmInput({ ...BASE, api_key: "sk-new-999999" }, saved).api_key, "sk-new-999999");
  const builtin = { ...BASE, kind: "builtin" as const, provider: "zai-coding-cn", model: "glm-5.3-flash" };
  assert.throws(() => normalizeLlmInput(builtin, saved), /API Key/);
});

test("下发给页面的配置不含 Key，只有是否已设置与末四位", () => {
  const settings = normalizeLlmInput({ ...BASE, api_key: "sk-secret-abcd" }, null);
  const view = llmView({ settings, updated_at: 1, updated_by: 1 }, "admin");
  assert.equal(JSON.stringify(view).includes("sk-secret"), false);
  assert.equal(view.api_key_set, true);
  assert.equal(view.api_key_hint, "abcd");
  assert.equal(view.updated_by, "admin");
  const short = llmView({ settings: { ...settings, api_key: "abc" }, updated_at: 1, updated_by: null }, null);
  assert.equal(short.api_key_hint, null);
});

test("未配置时 requireLlm 抛 503 + llm_not_configured；保存后重置缓存即生效", async () => {
  installTestLlm(null);
  assert.equal(activeLlm(), null);
  assert.equal(llmLabel(), null);
  const err = await requireLlm().catch((e: unknown) => e);
  assert.deepEqual(httpErrorOf(err), {
    status: 503,
    body: { detail: "管理员尚未配置模型", code: "llm_not_configured" },
  });

  const db = installTestLlm({ kind: "builtin", provider: "zai-coding-cn", model: "glm-5.3-flash", api_key: "zk-web" });
  assert.equal(llmLabel(), "zai-coding-cn/glm-5.3-flash");
  assert.equal((await requireLlm()).id, "glm-5.3-flash");
  // 内置厂商的 Key 随请求传入，优先于环境变量
  assert.deepEqual(llmRequestOptions(), { apiKey: "zk-web", temperature: 0.3 });

  const next: LlmSettings = { ...(activeLlm() as LlmSettings), model: "glm-4.6v", temperature: 0.7 };
  db.setLlm(next, 1);
  assert.equal(getConfiguredModel().id, "glm-5.3-flash");
  resetLlmRuntime();
  assert.equal(getConfiguredModel().id, "glm-4.6v");
  assert.equal(llmRequestOptions().temperature, 0.7);
});

test("自建服务注册为 custom provider；免 Key 服务发占位 Key；Key 不随请求另传", async () => {
  installTestLlm({ kind: "openai-completions", provider: "custom", model: "m", base_url: "http://10.0.0.5:8000/v1" });
  const model = await requireLlm();
  assert.equal(model.provider, "custom");
  assert.equal(model.baseUrl, "http://10.0.0.5:8000/v1");
  assert.equal(model.reasoning, false);
  assert.deepEqual(llmRequestOptions(), { temperature: 0.3 });
  installTestLlm({
    kind: "openai-completions",
    provider: "custom",
    model: "m",
    base_url: "http://x/v1",
    thinking: "high",
  });
  assert.equal(getConfiguredModel().reasoning, true);
});

test("设置库文件只给属主读写", () => {
  const db = installTestLlm(null);
  const file = (db as unknown as { _path: string })._path;
  assert.equal(statSync(file).mode & 0o777, 0o600);
});

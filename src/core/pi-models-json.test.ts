import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  applyModelsJson,
  applyModelsJsonFile,
  envCustomProvider,
  KEYLESS_API_KEY,
  parseModelsJsonSubset,
} from "./pi-models-json.ts";

test("parseModelsJsonSubset 拒绝非对象", () => {
  assert.throws(() => parseModelsJsonSubset([]), /须为对象/);
});

test("applyModelsJson 注册 openai-completions 子集", () => {
  const models = builtinModels();
  applyModelsJson(models, {
    providers: {
      ollama: {
        baseUrl: "http://127.0.0.1:11434/v1",
        api: "openai-completions",
        apiKey: "ollama",
        models: [{ id: "qwen2.5-coder:7b" }],
      },
    },
  });
  const model = models.getModel("ollama", "qwen2.5-coder:7b");
  assert.ok(model);
  assert.equal(model.api, "openai-completions");
  assert.equal(model.baseUrl, "http://127.0.0.1:11434/v1");
});

test("applyModelsJson 拒绝未知 api", () => {
  const models = builtinModels();
  assert.throws(
    () =>
      applyModelsJson(models, {
        providers: { x: { baseUrl: "http://127.0.0.1:1", api: "google-generative-ai", models: [{ id: "g" }] } },
      }),
    /不受支持/,
  );
});

test("applyModelsJsonFile 读文件", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asl-models-"));
  const file = path.join(dir, "models.json");
  writeFileSync(
    file,
    JSON.stringify({
      providers: {
        local: {
          baseUrl: "http://127.0.0.1:8000/v1",
          apiKey: "$LOCAL_KEY",
          models: [{ id: "demo" }],
        },
      },
    }),
  );
  const models = builtinModels();
  applyModelsJsonFile(models, file);
  assert.ok(models.getModel("local", "demo"));
});

test("applyModelsJson 透传 compat / headers / contextWindow，model 级覆盖 provider 级", () => {
  const models = builtinModels();
  applyModelsJson(models, {
    providers: {
      selfhosted: {
        baseUrl: "http://10.0.0.5:8000/v1/",
        apiKey: "k",
        headers: { "X-Tenant": "sec" },
        compat: { supportsStore: false, maxTokensField: "max_tokens" },
        contextWindow: 32_000,
        models: [
          { id: "qwen3-32b" },
          { id: "small", contextWindow: 8192, maxTokens: 2048, compat: { supportsStore: true } },
        ],
      },
    },
  });
  const big = models.getModel("selfhosted", "qwen3-32b");
  const small = models.getModel("selfhosted", "small");
  assert.ok(big && small);
  assert.equal(big.baseUrl, "http://10.0.0.5:8000/v1");
  assert.deepEqual(big.headers, { "X-Tenant": "sec" });
  assert.deepEqual(big.compat, { supportsStore: false, maxTokensField: "max_tokens" });
  assert.equal(big.contextWindow, 32_000);
  assert.equal(big.maxTokens, 8192);
  assert.deepEqual(small.compat, { supportsStore: true, maxTokensField: "max_tokens" });
  assert.equal(small.contextWindow, 8192);
  assert.equal(small.maxTokens, 2048);
});

test("apiKey 留空为免 Key 服务；$VAR 未设置仍视为缺 Key", async () => {
  const models = builtinModels();
  applyModelsJson(models, {
    providers: {
      open: { baseUrl: "http://10.0.0.5:8000/v1", models: [{ id: "m" }] },
      locked: { baseUrl: "http://10.0.0.6:8000/v1", apiKey: "$ASL_TEST_UNSET_KEY", models: [{ id: "m" }] },
    },
  });
  const openModel = models.getModel("open", "m");
  const lockedModel = models.getModel("locked", "m");
  assert.ok(openModel && lockedModel);
  const open = await models.getAuth(openModel);
  assert.equal(open?.auth.apiKey, KEYLESS_API_KEY);
  assert.equal(await models.getAuth(lockedModel), undefined);
});

test("envCustomProvider 把 .env 单模型折成 provider，Key 只按变量名引用", () => {
  const custom = {
    baseUrl: "http://llm.example:9000",
    api: "anthropic-messages",
    compat: { supportsTemperature: false },
  };
  const spec = envCustomProvider(
    { llmProvider: "custom", llmModel: "my-model", customLlm: custom },
    { ASL_LLM_API_KEY: "secret" },
  );
  assert.deepEqual(spec, {
    providers: {
      custom: {
        baseUrl: "http://llm.example:9000",
        api: "anthropic-messages",
        apiKey: "$ASL_LLM_API_KEY",
        compat: { supportsTemperature: false },
        models: [{ id: "my-model" }],
      },
    },
  });
  const keyless = envCustomProvider(
    { llmProvider: "custom", llmModel: "m", customLlm: { ...custom, compat: null } },
    {},
  );
  assert.equal(keyless?.providers?.custom.apiKey, "");
  assert.equal(envCustomProvider({ llmProvider: "zai-coding-cn", llmModel: "m", customLlm: null }), null);
});

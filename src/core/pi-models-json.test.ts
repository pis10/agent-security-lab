import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { applyModelsJson, applyModelsJsonFile, parseModelsJsonSubset } from "./pi-models-json.ts";

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

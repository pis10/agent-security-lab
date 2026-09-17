import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyModelsJson,
  applyRemoteOverlay,
  createPiModels,
  fetchRemoteCatalog,
  parseModelsJsonSubset,
  parseRemoteCatalog,
} from "./pi-runtime.ts";

test("parseModelsJsonSubset 拒绝非对象", () => {
  assert.throws(() => parseModelsJsonSubset([]), /须为对象/);
});

test("applyModelsJson 注册 openai-completions 子集", () => {
  const models = createPiModels();
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
  const models = createPiModels();
  assert.throws(
    () =>
      applyModelsJson(models, {
        providers: { x: { baseUrl: "http://127.0.0.1:1", api: "google-generative-ai", models: [{ id: "g" }] } },
      }),
    /不受支持/,
  );
});

test("createPiModels 读文件", () => {
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
  const models = createPiModels(file);
  assert.ok(models.getModel("local", "demo"));
});

test("parseRemoteCatalog 接受 models 数组", () => {
  const models = parseRemoteCatalog("openai", {
    models: [{ id: "gpt-new", name: "GPT New", api: "openai-responses", provider: "openai" }],
  });
  assert.equal(models[0]?.id, "gpt-new");
  assert.equal(models[0]?.provider, "openai");
});

test("applyRemoteOverlay 覆盖同 id 并追加新 id", () => {
  const models = createPiModels();
  const before = models.getModel("zai-coding-cn", "glm-5.3-flash");
  assert.ok(before);
  applyRemoteOverlay(models, "zai-coding-cn", [
    { ...before, name: "overlay-flash" },
    { ...before, id: "glm-brand-new", name: "new" },
  ]);
  assert.equal(models.getModel("zai-coding-cn", "glm-5.3-flash")?.name, "overlay-flash");
  assert.ok(models.getModel("zai-coding-cn", "glm-brand-new"));
});

test("fetchRemoteCatalog 失败返回 null，404 返回空覆盖", async () => {
  const fail = (async () => {
    throw new Error("network");
  }) as unknown as typeof fetch;
  assert.equal(await fetchRemoteCatalog("openai", { fetch: fail }), null);

  const notFound = (async () => new Response("missing", { status: 404 })) as unknown as typeof fetch;
  const empty = await fetchRemoteCatalog("openai", { fetch: notFound });
  assert.deepEqual(empty, []);
});

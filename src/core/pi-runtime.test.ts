import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createPiModels } from "./pi-runtime.ts";

test("createPiModels 默认走包内目录", () => {
  const models = createPiModels();
  const model = models.getModel("zai-coding-cn", "glm-5.3-flash");
  assert.ok(model);
  assert.equal(model.provider, "zai-coding-cn");
  assert.equal(model.id, "glm-5.3-flash");
});

test("createPiModels 未知模型为 undefined", () => {
  const models = createPiModels();
  assert.equal(models.getModel("zai-coding-cn", "not-a-real-model"), undefined);
});

test("createPiModels 可选加载 models.json", () => {
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
  assert.ok(models.getModel("zai-coding-cn", "glm-5.3-flash"));
});

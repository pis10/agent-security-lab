/**多账号世界隔离：目录、防护、外发箱、通关进度互不影响；路径与并发保护。不调用模型。 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { ProgressDB } from "../core/db.ts";
import { BadRequestError, ConflictError, NotFoundError } from "../core/errors.ts";
import { resetPiModels } from "../core/pi-runtime.ts";
import { SINKS } from "../core/sinks.ts";
import { loadConfig, resetConfigCache } from "../lib/config.ts";
import { requireScenario } from "../scenarios/index.ts";
import { WorldManager, worldKey } from "./manager.ts";
import { evaluateScenario } from "./observations.ts";

const root = mkdtempSync(path.join(tmpdir(), "asl-worlds-"));
const usersDir = path.join(root, "users");
const progress = new ProgressDB(path.join(root, "progress.db"));
let manager: WorldManager;

before(() => {
  // 自建模型配置只为通过 requireLlm 与建 Agent；本文件不发起对话
  process.env.ASL_LLM_BASE_URL = "http://127.0.0.1:9/v1";
  process.env.ASL_LLM_MODEL = "test-model";
  process.env.ASL_LLM_API_KEY = "test-key";
  resetConfigCache();
  resetPiModels();
  manager = new WorldManager(loadConfig(), { usersDir, progress });
});

after(async () => {
  await manager.shutdown();
});

test("同一产品在两个账号下是两个世界", async () => {
  const a = await manager.ensure(1, "support_bot");
  const b = await manager.ensure(2, "support_bot");
  assert.notEqual(a, b);
  assert.equal(a.key, worldKey(1, "support_bot"));
  assert.equal(a.ctx.sessionId, a.key);
  assert.ok(existsSync(path.join(usersDir, "1", "worlds", "support_bot")));
  assert.ok(existsSync(path.join(usersDir, "2", "worlds", "support_bot")));

  await manager.setDefenses(1, "support_bot", ["tenant_acl"]);
  assert.deepEqual(manager.list(1)[0].enabled_defenses, ["tenant_acl"]);
  assert.deepEqual(manager.list(2)[0].enabled_defenses, []);
  assert.deepEqual(
    manager.list(3).map((w) => w.target_id),
    [],
  );
});

test("外发与通关按账号记录", async () => {
  const a = await manager.ensure(1, "support_bot");
  const b = await manager.ensure(2, "support_bot");
  SINKS.add(a.key, "http", { leaked: "tenant_b" });
  assert.equal(SINKS.received({ sessionId: a.key }).length, 1);
  assert.equal(SINKS.received({ sessionId: b.key }).length, 0);

  const scenario = requireScenario("ticket-idor", "support_bot");
  a.tracer.record("tool_result", { name: "get_ticket", result: '{"tenant":"tenant_b"}' });
  assert.equal(evaluateScenario(a, scenario, progress).passed, true);
  assert.equal(evaluateScenario(b, scenario, progress).passed, false);
  assert.ok("ticket-idor" in progress.captured(1));
  assert.ok(!("ticket-idor" in progress.captured(2)));
});

test("重置本人只清自己的世界与进度", async () => {
  await manager.ensure(1, "devops_assistant");
  progress.recordCapture(2, "ticket-idor", worldKey(2, "support_bot"), []);
  await manager.resetUser(1);
  assert.deepEqual(manager.list(1), []);
  assert.deepEqual(progress.captured(1), {});
  assert.ok(!existsSync(path.join(usersDir, "1", "worlds")));
  assert.deepEqual(
    manager.list(2).map((w) => w.target_id),
    ["support_bot"],
  );
  assert.ok("ticket-idor" in progress.captured(2));
});

test("产品 id 与账号 id 先校验，不拼进文件路径", async () => {
  await assert.rejects(manager.ensure(1, "../../users"), NotFoundError);
  await assert.rejects(manager.reset(1, "../2/worlds/support_bot"), NotFoundError);
  await assert.rejects(manager.ensure(0, "support_bot"), BadRequestError);
  assert.ok(existsSync(path.join(usersDir, "2", "worlds", "support_bot")));
});

test("同一世界一轮对话没结束时，拒绝再发、清空与重置", async () => {
  const w = await manager.ensure(2, "support_bot");
  w.busy = true;
  try {
    await assert.rejects(manager.chat(2, "support_bot", "hi"), ConflictError);
    await assert.rejects(manager.clearChat(2, "support_bot"), ConflictError);
    await assert.rejects(manager.reset(2, "support_bot"), ConflictError);
    await assert.rejects(manager.resetUser(2), ConflictError);
    // 其他账号不受影响
    await manager.reset(3, "support_bot");
  } finally {
    w.busy = false;
  }
});

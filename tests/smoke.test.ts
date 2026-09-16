import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { BadRequestError, NotFoundError } from "../src/core/errors.ts";
import { loadConfig } from "../src/lib/config.ts";
import { requireScenario } from "../src/scenarios/index.ts";

test("node:sqlite 可用且基本读写正常", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  db.prepare("INSERT INTO t (v) VALUES (?)").run("hello");
  const row = db.prepare("SELECT v FROM t WHERE id = 1").get() as { v: string };
  assert.equal(row.v, "hello");
  db.close();
});

test("requireScenario:未知场景 404，跨靶标 400", () => {
  assert.throws(() => requireScenario("no-such-scenario"), NotFoundError);
  assert.throws(() => requireScenario("cmd-injection", "support_bot"), BadRequestError);
  assert.equal(requireScenario("cmd-injection", "devops_assistant").id, "cmd-injection");
});

test("config 默认值与 .env 加载", () => {
  const c = loadConfig();
  assert.equal(c.llmModel, "glm-5.3-flash");
  assert.equal(c.llmBaseUrl, "https://open.bigmodel.cn/api/coding/paas/v4");
  assert.equal(typeof c.llmTemperature, "number");
  assert.ok(c.port > 0);
});

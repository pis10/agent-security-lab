/**多账号世界隔离：目录、防护、外发箱、通关进度互不影响；路径与并发保护。不调用模型。 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { ProgressDB } from "../core/db.ts";
import { BadRequestError, ConflictError, NotFoundError } from "../core/errors.ts";
import { installTestLlm } from "../core/llm-testing.ts";
import { SINKS } from "../core/sinks.ts";
import { loadConfig } from "../lib/config.ts";
import { requireScenario } from "../scenarios/index.ts";
import { WorldManager, worldKey } from "./manager.ts";
import { evaluateScenario } from "./observations.ts";

const root = mkdtempSync(path.join(tmpdir(), "asl-worlds-"));
const usersDir = path.join(root, "users");
const progress = new ProgressDB(path.join(root, "progress.db"));
let manager: WorldManager;

before(() => {
  // 自建模型配置只为通过 requireLlm 与建 Agent；对话测试替换模型调用，不访问外网。
  installTestLlm({
    kind: "openai-completions",
    provider: "custom",
    model: "test-model",
    base_url: "http://127.0.0.1:9/v1",
    api_key: "test-key",
  });
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

function gate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("真实挂起的对话：并发聊天和状态修改返回 409，其他世界继续运行", async () => {
  const w = await manager.ensure(40, "support_bot");
  const entered = gate();
  const finish = gate();
  const prompt = w.agent.prompt;
  w.agent.prompt = async () => {
    entered.release();
    await finish.promise;
  };
  const running = manager.chat(40, "support_bot", "first");
  await entered.promise;
  try {
    await assert.rejects(manager.chat(40, "support_bot", "second"), ConflictError);
    await assert.rejects(manager.clearChat(40, "support_bot"), ConflictError);
    await assert.rejects(manager.reset(40, "support_bot"), ConflictError);
    await assert.rejects(manager.resetUser(40), ConflictError);
    await assert.rejects(manager.setDefenses(40, "support_bot", ["tenant_acl"]), ConflictError);
    await assert.rejects(manager.act(40, "support_bot", "anything", {}), ConflictError);
    await manager.reset(41, "support_bot");
    await manager.ensure(40, "devops_assistant");
    assert.equal(w.busy, true);
  } finally {
    finish.release();
    await running;
    w.agent.prompt = prompt;
  }
  assert.equal(w.busy, false);
  await manager.clearChat(40, "support_bot");
});

test("重置、修改防护和清空交错时，后续操作始终使用重建后的世界", async () => {
  const old = await manager.ensure(50, "support_bot");
  const entered = gate();
  const finish = gate();
  const end = old.target.onSessionEnd;
  old.target.onSessionEnd = async () => {
    entered.release();
    await finish.promise;
  };
  const reset = manager.reset(50, "support_bot");
  await entered.promise;
  const defense = manager.setDefenses(50, "support_bot", ["tenant_acl"]);
  const clear = manager.clearChat(50, "support_bot");
  finish.release();
  try {
    const [fresh, defended, cleared] = await Promise.all([reset, defense, clear]);
    assert.notEqual(fresh, old);
    assert.equal(fresh, defended);
    assert.equal(fresh, cleared);
    assert.deepEqual(manager.snapshot(fresh).enabled_defenses, ["tenant_acl"]);
    assert.deepEqual(manager.snapshot(old).enabled_defenses, []);
  } finally {
    old.target.onSessionEnd = end;
  }
});

test("账号重置封住创建/聊天入口，其他账号不受影响，结束后可以重新进入", async () => {
  const w = await manager.ensure(60, "support_bot");
  const entered = gate();
  const finish = gate();
  const end = w.target.onSessionEnd;
  w.target.onSessionEnd = async () => {
    entered.release();
    await finish.promise;
  };
  const resetting = manager.resetUser(60);
  await entered.promise;
  try {
    await assert.rejects(manager.ensure(60, "devops_assistant"), ConflictError);
    await assert.rejects(manager.chat(60, "support_bot", "hi"), ConflictError);
    await assert.rejects(manager.resetUser(60), ConflictError);
    await manager.ensure(61, "support_bot");
  } finally {
    finish.release();
    await resetting;
    w.target.onSessionEnd = end;
  }
  assert.deepEqual(manager.list(60), []);
  assert.ok(!existsSync(path.join(usersDir, "60", "worlds")));
  assert.notEqual(await manager.ensure(60, "support_bot"), w);
});

test("账号重置等待尚未完成的世界初始化，不遗漏新世界", async () => {
  const reference = await manager.ensure(70, "support_bot");
  const seed = reference.target.seed;
  const entered = gate();
  const finish = gate();
  reference.target.seed = async (ctx) => {
    entered.release();
    await finish.promise;
    await seed?.(ctx);
  };
  const creating = manager.ensure(71, "support_bot");
  await entered.promise;
  const resetting = manager.resetUser(71);
  finish.release();
  try {
    await Promise.all([creating, resetting]);
    assert.deepEqual(manager.list(71), []);
    assert.ok(!existsSync(path.join(usersDir, "71", "worlds")));
  } finally {
    reference.target.seed = seed;
  }
});

test("SDK 返回错误状态时不复述上一轮回复，且释放 busy", async (t) => {
  const world = await manager.ensure(80, "support_bot");
  const { appendAssistantNote } = await import("../core/agent.ts");
  appendAssistantNote(world.agent, "previous reply");
  t.mock.method(console, "error", () => {});
  t.mock.method(world.agent, "streamFunction", () => {
    throw new Error("test model failure");
  });
  const reply = await manager.chat(80, "support_bot", "next");
  assert.match(reply, /^\[error\]/);
  assert.doesNotMatch(reply, /previous reply/);
  assert.equal(world.busy, false);
});

test("世界初始化后段失败时也关闭已启动的 MCP，避免重复自检留下子进程", async (t) => {
  const { getTarget } = await import("../targets/registry.ts");
  const target = getTarget("mcp_playground");
  const end = target.onSessionEnd;
  assert.ok(end);
  let closed = 0;
  t.mock.method(target, "buildTools", async () => {
    throw new Error("test initialization failure");
  });
  t.mock.method(
    target as { onSessionEnd: NonNullable<typeof target.onSessionEnd> },
    "onSessionEnd",
    async (ctx: Parameters<typeof end>[0]) => {
      const clients = Object.values(ctx.state.mcp as Record<string, { connectionState: string }>);
      await end(ctx);
      assert.equal(clients.length, 2);
      assert.ok(clients.every((client) => client.connectionState === "closed"));
      closed++;
    },
  );
  await assert.rejects(manager.ensure(91, "mcp_playground"), /test initialization failure/);
  assert.equal(closed, 1);
  await manager.resetUser(91);
  assert.deepEqual(manager.list(91), []);
});

function isolatedManager(options: Partial<ReturnType<typeof loadConfig>> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "asl-capacity-"));
  return new WorldManager(
    { ...loadConfig(), ...options },
    {
      usersDir: path.join(dir, "users"),
      progress: new ProgressDB(path.join(dir, "progress.db")),
    },
  );
}

test("全局限流按 FIFO 排队，排队中的世界仍拒绝重复发送，结束释放容量", async (t) => {
  const m = isolatedManager({ maxConcurrentTurns: 1 });
  const first = await m.ensure(101, "support_bot");
  const second = await m.ensure(102, "support_bot");
  const third = await m.ensure(103, "support_bot");
  const entered = gate(),
    finish = gate();
  const order: number[] = [];
  t.mock.method(first.agent, "prompt", async () => {
    order.push(1);
    entered.release();
    await finish.promise;
  });
  t.mock.method(second.agent, "prompt", async () => {
    order.push(2);
  });
  t.mock.method(third.agent, "prompt", async () => {
    order.push(3);
  });
  const a = m.chat(101, "support_bot", "one");
  await entered.promise;
  const b = m.chat(102, "support_bot", "two");
  const c = m.chat(103, "support_bot", "three");
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(m.snapshot(first).run_status, "running");
  assert.equal(m.snapshot(second).run_status, "queued");
  await assert.rejects(m.chat(102, "support_bot", "duplicate"), ConflictError);
  await assert.rejects(m.resetUser(102), ConflictError);
  await m.evictIdle(Date.now() + 1_000_000);
  assert.equal(second.busy, true);
  finish.release();
  await Promise.all([a, b, c]);
  assert.deepEqual(order, [1, 2, 3]);
  assert.equal(m.snapshot(third).run_status, "idle");
  await m.shutdown();
});

test("轮次超时走 SDK abort，等待停止后释放世界与并发容量", async (t) => {
  const m = isolatedManager({ maxConcurrentTurns: 1, turnTimeoutMs: 20 });
  const w = await m.ensure(111, "support_bot");
  const stopped = gate();
  t.mock.method(console, "error", () => {});
  t.mock.method(w.agent, "prompt", async () => stopped.promise);
  const abort = t.mock.method(w.agent, "abort", () => stopped.release());
  const reply = await m.chat(111, "support_bot", "wait");
  assert.match(reply, /超时/);
  assert.equal(abort.mock.callCount(), 1);
  assert.equal(w.busy, false);
  const other = await m.ensure(112, "support_bot");
  t.mock.method(other.agent, "prompt", async () => {});
  await m.chat(112, "support_bot", "next");
  assert.equal(m.snapshot(other).run_status, "idle");
  await m.shutdown();
});

test("空闲回收保留磁盘、记忆、轨迹和外发；恢复不重复载入", async () => {
  const m = isolatedManager();
  const w = await m.ensure(121, "mail_agent", "memory-poisoning");
  await m.act(121, "mail_agent", "import_email", { from: "test@example.com", subject: "restore-me", body: "body" });
  await m.setDefenses(121, "mail_agent", ["memory_write_gate"]);
  const { appendAssistantNote } = await import("../core/agent.ts");
  appendAssistantNote(w.agent, "persisted reply");
  w.tracer.record("note", { text: "persisted trace" });
  SINKS.add(w.key, "email", { subject: "persisted sink" });
  await m.evictIdle(Date.now() + 1_000_000);
  assert.equal(SINKS.received({ sessionId: w.key }).length, 0);
  assert.equal(m.list(121)[0].messages?.at(-1)?.content, "persisted reply");
  const restored = await m.ensure(121, "mail_agent");
  assert.notEqual(restored, w);
  assert.equal(restored.scenarioId, "memory-poisoning");
  assert.equal(restored.tracer.ofKind("note").length, 1);
  assert.equal(SINKS.received({ sessionId: w.key }).length, 1);
  assert.deepEqual(m.snapshot(restored).enabled_defenses, ["memory_write_gate"]);
  assert.match(JSON.stringify(await restored.target.simState(restored.ctx)), /restore-me/);
  await m.ensure(121, "mail_agent");
  assert.equal(SINKS.received({ sessionId: w.key }).length, 1);
  await m.shutdown();
});

test("L5 空闲回收关闭两个真实 MCP 子进程，重新进入可正常调用", async () => {
  const m = isolatedManager();
  const w = await m.ensure(131, "mcp_playground");
  const clients = Object.values(w.ctx.state.mcp as Record<string, { connectionState: string }>);
  assert.equal(clients.length, 2);
  await m.evictIdle(Date.now() + 1_000_000);
  assert.ok(clients.every((c) => c.connectionState === "closed"));
  const fresh = await m.ensure(131, "mcp_playground");
  assert.notEqual(w, fresh);
  assert.match(JSON.stringify(await fresh.target.simState(fresh.ctx)), /create_download_session/);
  await m.shutdown();
});

test("冷世界切换课程也重建数据，不把上一关的证据带到新课程", async () => {
  const m = isolatedManager();
  const w = await m.ensure(141, "devops_assistant", "cmd-injection");
  await m.setDefenses(141, "devops_assistant", ["cmd_allowlist"]);
  w.tracer.record("note", { text: "previous lesson" });
  await m.evictIdle(Date.now() + 1_000_000);
  const next = await m.ensure(141, "devops_assistant", "ssrf-cloud-metadata");
  assert.equal(next.tracer.events.length, 0);
  assert.equal(next.scenarioId, "ssrf-cloud-metadata");
  assert.deepEqual(m.snapshot(next).enabled_defenses, ["cmd_allowlist"]);
  const free = await m.ensure(142, "support_bot");
  free.tracer.record("note", { text: "free exploration" });
  await m.evictIdle(Date.now() + 1_000_000);
  const lesson = await m.ensure(142, "support_bot", "ticket-idor");
  assert.equal(lesson.tracer.events.length, 0);
  assert.equal(lesson.scenarioId, "ticket-idor");
  await m.shutdown();
});

test("教学复测只记录新一轮相关工具；旧通关和切换防护不算复测", async (t) => {
  const m = isolatedManager();
  const w = await m.ensure(151, "support_bot", "ticket-idor");
  w.tracer.record("tool_result", { name: "get_ticket", result: '{"tenant":"tenant_b"}' });
  const scenario = requireScenario("ticket-idor");
  evaluateScenario(w, scenario, m.progress);
  await m.setDefenses(151, "support_bot", ["tenant_acl"]);
  evaluateScenario(w, scenario, m.progress);
  assert.deepEqual(m.progress.retests(151), {});
  assert.deepEqual(m.progress.captured(151)[scenario.id].defenses, []);
  t.mock.method(w.agent, "prompt", async () => {});
  await m.chat(151, "support_bot", "just chatting");
  assert.deepEqual(m.progress.retests(151), {});
  t.mock.method(w.agent, "prompt", async () => {
    w.tracer.record("tool_call", { name: "get_ticket" });
    w.tracer.record("policy_blocked", { defense: "tenant_acl" });
  });
  await m.chat(151, "support_bot", "retry");
  assert.equal(m.progress.retests(151)[scenario.id].outcome, "blocked");
  t.mock.method(w.agent, "prompt", async () => {
    w.tracer.record("tool_call", { name: "get_ticket" });
  });
  await m.chat(151, "support_bot", "normal lookup");
  assert.equal(m.progress.retests(151)[scenario.id].outcome, "exercised");
  t.mock.method(w.agent, "prompt", async () => {
    w.tracer.record("tool_call", { name: "get_ticket" });
    w.tracer.record("tool_result", { name: "get_ticket", result: "[error] connection failed" });
  });
  await m.chat(151, "support_bot", "failed lookup");
  assert.equal(m.progress.retests(151)[scenario.id].outcome, "error");
  assert.deepEqual(m.progress.retests(152), {});
  await m.resetUser(151);
  assert.deepEqual(m.progress.retests(151), {});
  await m.shutdown();
});

test("停机取消运行与排队，不启动排队轮次", async (t) => {
  const m = isolatedManager({ maxConcurrentTurns: 1 });
  const a = await m.ensure(161, "support_bot"),
    b = await m.ensure(162, "support_bot");
  const entered = gate(),
    stopped = gate();
  t.mock.method(console, "error", () => {});
  t.mock.method(a.agent, "prompt", async () => {
    entered.release();
    await stopped.promise;
  });
  t.mock.method(a.agent, "abort", () => stopped.release());
  const second = t.mock.method(b.agent, "prompt", async () => {});
  const runA = m.chat(161, "support_bot", "one");
  await entered.promise;
  const runB = m.chat(162, "support_bot", "two");
  await new Promise<void>((r) => setImmediate(r));
  await m.shutdown();
  await Promise.all([runA, runB]);
  assert.equal(second.mock.callCount(), 0);
  assert.equal(a.busy, false);
  assert.equal(b.busy, false);
  await assert.rejects(m.ensure(163, "support_bot"), ConflictError);
});

test("读取进度库失败也释放 busy，不把世界永久卡在排队状态", async (t) => {
  const m = isolatedManager({ maxConcurrentTurns: 1 });
  const w = await m.ensure(171, "support_bot");
  t.mock.method(console, "error", () => {});
  const fault = t.mock.method(m.progress, "captured", () => {
    throw new Error("test database failure");
  });
  const reply = await m.chat(171, "support_bot", "one");
  assert.match(reply, /^\[error\]/);
  assert.equal(w.busy, false);
  assert.equal(m.snapshot(w).run_status, "idle");
  fault.mock.restore();
  t.mock.method(w.agent, "prompt", async () => {});
  await m.chat(171, "support_bot", "retry");
  assert.equal(w.busy, false);
  await m.shutdown();
});

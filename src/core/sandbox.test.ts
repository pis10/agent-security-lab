import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfig, resetConfigCache } from "../lib/config.ts";
import { maxJobsOf, parseJob } from "../sandbox/protocol.ts";
import { devopsAssistant } from "../targets/devops_assistant.ts";
import { readReportInSandbox } from "./sandbox.ts";
import { ToolContext } from "./tools.ts";
import { Tracer } from "./trace.ts";

test("应用只发送报告内容与原样文件名；防护在投递前拦截，无服务时绝不本机执行", async (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "asl-sandbox-client-"));
  const socket = path.join(root, "s.sock");
  const workdir = path.join(root, "reports");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(workdir);
  writeFileSync(path.join(workdir, "report.txt"), "hello");
  writeFileSync(path.join(root, "secret"), "private");
  symlinkSync(path.join(root, "secret"), path.join(workdir, "link"));
  const previous = process.env.ASL_SANDBOX_SOCKET;
  process.env.ASL_SANDBOX_SOCKET = socket;
  t.after(() => {
    if (previous === undefined) delete process.env.ASL_SANDBOX_SOCKET;
    else process.env.ASL_SANDBOX_SOCKET = previous;
    rmSync(root, { recursive: true, force: true });
  });
  const seen: unknown[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    seen.push(JSON.parse(body));
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ output: "isolated output" }));
  });
  await new Promise<void>((resolve) => server.listen(socket, resolve));
  t.after(() => server.close());
  assert.equal(await readReportInSandbox(workdir, "report.txt; id"), "isolated output");
  assert.deepEqual(seen, [{ filename: "report.txt; id", files: { "report.txt": "hello" } }]);
  const ctx = new ToolContext("u1:devops_assistant", new Tracer(), loadConfig(), {
    workdir,
    defenses: new Set(["cmd_allowlist"]),
  });
  const tools = await devopsAssistant.buildTools(ctx);
  const read = tools.find((tool) => tool.name === "read_report");
  assert.ok(read);
  assert.match(JSON.stringify(await read.execute("test", { filename: "report.txt; id" })), /blocked/);
  assert.equal(seen.length, 1);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const marker = path.join(root, "host-executed");
  assert.match(await readReportInSandbox(workdir, `report.txt; touch ${marker}`), /执行服务不可用/);
  assert.equal(existsSync(marker), false);
});

test("沙箱协议拒绝扩展 Docker 字段、非法文件路径与超量文件", () => {
  assert.throws(() => parseJob({ filename: "x", files: {}, mounts: ["/"] }), /Unexpected/);
  assert.throws(() => parseJob({ filename: "x", files: { "../accounts.db": "bad" } }), /Invalid report name/);
  assert.throws(() => parseJob({ filename: "x", files: { big: "x".repeat(40_000) } }), /too large/);
});

test("执行容器并发默认与对话并发默认值一致，非法配置拒绝启动", () => {
  resetConfigCache();
  const defaults = loadConfig({});
  resetConfigCache();
  assert.equal(maxJobsOf(undefined), defaults.maxConcurrentTurns);
  assert.equal(maxJobsOf("8"), 8);
  for (const raw of ["0", "-1", "2.5", "abc", ""]) assert.throws(() => maxJobsOf(raw), /positive integer/, raw);
});

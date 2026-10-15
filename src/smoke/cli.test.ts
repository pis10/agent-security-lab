/**CLI 完整流程：模拟模型协议，实际启动命令、执行工具、落盘报告并检查退出码。 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { TEST_LLM_DEFAULTS } from "../core/llm-testing.ts";
import { SettingsDB } from "../core/settings.ts";

const exec = promisify(execFile);

test("CLI 报告、退出码、错误统计、文件防覆盖与 L2 预检", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "asl-cli-test-"));
  let fail = false;
  let requests = 0;
  const server = createServer(async (req, res) => {
    requests++;
    let raw = "";
    for await (const chunk of req) raw += chunk;
    if (fail) {
      res
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify({ error: { message: "test failure" } }));
      return;
    }
    const body = JSON.parse(raw);
    const hasToolResult = body.messages.some((message: { role: string }) => message.role === "tool");
    const delta = hasToolResult
      ? { content: "完成" }
      : {
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "get_ticket", arguments: '{"ticket_id":"T-2001"}' },
            },
          ],
        };
    const chunk = (delta: object, finish_reason: string | null) =>
      `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", model: "test", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(`${chunk(delta, null)}${chunk({}, hasToolResult ? "stop" : "tool_calls")}data: [DONE]\n\n`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  // 模型配置写进临时设置库，用 --settings 指给 CLI，不碰 data/runtime
  const settings = path.join(root, "settings.db");
  new SettingsDB(settings).setLlm(
    {
      ...TEST_LLM_DEFAULTS,
      kind: "openai-completions",
      provider: "custom",
      model: "test",
      base_url: `http://127.0.0.1:${address.port}/v1`,
      api_key: "smoke-test-key",
    },
    null,
  );
  const empty = path.join(root, "empty-settings.db");
  new SettingsDB(empty);
  const env = {
    ...process.env,
    ASL_SANDBOX_SOCKET: path.join(root, "no-socket"),
    TMPDIR: root,
  };
  const run = async (file: string, ...args: string[]) => {
    try {
      const { stdout } = await exec(
        process.execPath,
        ["src/smoke/run.ts", "--output", path.join(root, file), "--settings", settings, ...args],
        { env, timeout: 20_000 },
      );
      return { code: 0, stdout };
    } catch (error) {
      const e = error as { code: number; stdout: string };
      return { code: e.code, stdout: e.stdout };
    }
  };
  try {
    const success = await run("success.json", "--scenario", "ticket-idor", "--runs", "2");
    assert.equal(success.code, 0, success.stdout);
    const raw = readFileSync(path.join(root, "success.json"), "utf8");
    const report = JSON.parse(raw);
    assert.equal(report.complete, true);
    assert.equal(report.samples.length, 4);
    assert.deepEqual(report.summary[0].attack, { successes: 2, total: 2 });
    assert.deepEqual(report.summary[0].defense, { blocks: 2, total: 2 });
    assert.doesNotMatch(raw, /smoke-test-key|tenant_b|T-2001/);
    assert.equal(readdirSync(root).filter((name) => name.startsWith("asl-smoke-")).length, 0);
    const requestCount = requests;
    // 管理员还没配置模型：配置失败退出码 2，不发请求、不写报告
    const unconfigured = await exec(
      process.execPath,
      ["src/smoke/run.ts", "--output", path.join(root, "unconfigured.json"), "--settings", empty],
      { env, timeout: 20_000 },
    ).then(
      () => 0,
      (e: { code: number }) => e.code,
    );
    assert.equal(unconfigured, 2);
    assert.equal(existsSync(path.join(root, "unconfigured.json")), false);
    assert.equal((await run("success.json", "--scenario", "ticket-idor")).code, 2);
    assert.equal(readFileSync(path.join(root, "success.json"), "utf8"), raw);
    assert.equal((await run("missing-sandbox.json", "--scenario", "cmd-injection")).code, 2);
    assert.equal(existsSync(path.join(root, "missing-sandbox.json")), false);
    assert.equal(requests, requestCount, "预检失败不应消耗模型调用");
    fail = true;
    assert.equal((await run("failure.json", "--scenario", "ticket-idor", "--runs", "1")).code, 1);
    const failure = JSON.parse(readFileSync(path.join(root, "failure.json"), "utf8"));
    assert.equal(failure.complete, true);
    assert.deepEqual(
      failure.samples.map((sample: { outcome: string }) => sample.outcome),
      ["error", "error"],
    );
    assert.equal(failure.summary[0].defense.blocks, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
});

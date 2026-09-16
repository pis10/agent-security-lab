import assert from "node:assert/strict";
import test from "node:test";
import { LLMClient, parseChatResponse } from "../src/core/llm.ts";
import type { Config } from "../src/lib/config.ts";

const fakeConfig = {
  llmBaseUrl: "http://llm.test/v1",
  llmApiKey: "k",
  llmModel: "test-model",
  llmThinking: "",
  llmTemperature: 0.3,
  port: 8600,
} as Config;

/**替身 fetch：按队列依次出队响应/异常，并计数调用次数。 */
function stubFetch(script: Array<Response | Error>): { calls: number; restore: () => void } {
  const real = globalThis.fetch;
  let calls = 0;
  const queue = [...script];
  globalThis.fetch = (async () => {
    calls += 1;
    const step = queue.shift();
    if (step instanceof Error) throw step;
    return step;
  }) as typeof fetch;
  return {
    get calls() {
      return calls;
    },
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

const jsonResponse = (status: number, body: unknown = { choices: [{ message: { content: "ok" } }] }) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("解析 content + tool_calls,保留原始 arguments JSON", () => {
  const r = parseChatResponse({
    choices: [
      {
        message: {
          content: null,
          reasoning_content: "想一想",
          tool_calls: [
            {
              id: "call_1",
              function: { name: "run_script", arguments: '{"filename":"report.txt; id"}' },
            },
          ],
        },
      },
    ],
  });
  assert.equal(r.content, null);
  assert.equal(r.reasoning, "想一想");
  assert.equal(r.toolCalls.length, 1);
  assert.equal(r.toolCalls[0].name, "run_script");
  assert.deepEqual(r.toolCalls[0].arguments, { filename: "report.txt; id" });
  assert.equal(r.toolCalls[0].argumentsJson, '{"filename":"report.txt; id"}');
});

test("非法 arguments JSON → {_raw} 保留原文", () => {
  const r = parseChatResponse({
    choices: [{ message: { content: "", tool_calls: [{ id: "c", function: { name: "t", arguments: "{oops" } }] } }],
  });
  assert.equal(r.content, null); // 空字符串与缺失一样视为 null
  assert.deepEqual(r.toolCalls[0].arguments, { _raw: "{oops" });
});

test("无 tool_calls 的普通回复", () => {
  const r = parseChatResponse({ choices: [{ message: { content: "你好" } }] });
  assert.equal(r.content, "你好");
  assert.equal(r.toolCalls.length, 0);
  assert.equal(r.reasoning, null);
});

test("retry:非重试状态码（401）只请求一次，立即失败", async () => {
  const stub = stubFetch([jsonResponse(401, { error: "bad key" })]);
  try {
    const client = new LLMClient(fakeConfig);
    await assert.rejects(client.chat([{ role: "user", content: "hi" }]), /LLM 401/);
    assert.equal(stub.calls, 1);
  } finally {
    stub.restore();
  }
});

test("retry:5xx 第一次失败后重试一次成功", async () => {
  const stub = stubFetch([jsonResponse(503, {}), jsonResponse(200)]);
  try {
    const client = new LLMClient(fakeConfig);
    const r = await client.chat([{ role: "user", content: "hi" }]);
    assert.equal(r.content, "ok");
    assert.equal(stub.calls, 2);
  } finally {
    stub.restore();
  }
});

test("retry:网络异常重试一次后成功", async () => {
  const stub = stubFetch([new Error("ECONNREFUSED"), jsonResponse(200)]);
  try {
    const client = new LLMClient(fakeConfig);
    const r = await client.chat([{ role: "user", content: "hi" }]);
    assert.equal(r.content, "ok");
    assert.equal(stub.calls, 2);
  } finally {
    stub.restore();
  }
});

test("retry:网络异常连续两次 → 抛出", async () => {
  const stub = stubFetch([new Error("ECONNREFUSED"), new Error("ECONNREFUSED")]);
  try {
    const client = new LLMClient(fakeConfig);
    await assert.rejects(client.chat([{ role: "user", content: "hi" }]), /ECONNREFUSED/);
    assert.equal(stub.calls, 2);
  } finally {
    stub.restore();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseChatResponse } from "../src/core/llm.ts";

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
  assert.equal(r.content, null); // 空字符串按 None 语义处理
  assert.deepEqual(r.toolCalls[0].arguments, { _raw: "{oops" });
});

test("无 tool_calls 的普通回复", () => {
  const r = parseChatResponse({ choices: [{ message: { content: "你好" } }] });
  assert.equal(r.content, "你好");
  assert.equal(r.toolCalls.length, 0);
  assert.equal(r.reasoning, null);
});

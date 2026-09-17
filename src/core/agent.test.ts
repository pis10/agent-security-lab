import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { endedOnToolResults, isPiTranscript, projectChat } from "./agent.ts";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

test("isPiTranscript 要求 timestamp", () => {
  assert.equal(isPiTranscript([{ role: "system", content: "hi" }]), false);
  assert.equal(isPiTranscript([{ role: "system", content: "hi", timestamp: 1 }]), true);
});

test("projectChat 只投影 user 与 assistant 文本", () => {
  const messages = [
    { role: "system", content: "sys", timestamp: 1 },
    { role: "user", content: "hello", timestamp: 2 },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "..." },
        { type: "text", text: "ok" },
        { type: "toolCall", id: "1", name: "get_ticket", arguments: { ticket_id: "T-1" } },
      ],
      api: "openai-completions",
      provider: "zai-coding-cn",
      model: "glm-5.3-flash",
      usage,
      stopReason: "toolUse",
      timestamp: 3,
    },
    {
      role: "toolResult",
      toolCallId: "1",
      toolName: "get_ticket",
      content: [{ type: "text", text: "secret" }],
      isError: false,
      timestamp: 4,
    },
  ] as AgentMessage[];
  assert.deepEqual(projectChat(messages), [
    { role: "user", content: "hello" },
    { role: "assistant", content: "ok" },
  ]);
});

test("endedOnToolResults 在 toolResult 收尾时为真", () => {
  const messages = [
    {
      role: "assistant",
      content: [{ type: "toolCall", id: "1", name: "x", arguments: {} }],
      api: "openai-completions",
      provider: "p",
      model: "m",
      usage,
      stopReason: "toolUse",
      timestamp: 1,
    },
    {
      role: "toolResult",
      toolCallId: "1",
      toolName: "x",
      content: [{ type: "text", text: "r" }],
      isError: false,
      timestamp: 2,
    },
  ] as AgentMessage[];
  assert.equal(endedOnToolResults(messages), true);
});

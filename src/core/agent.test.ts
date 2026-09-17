import assert from "node:assert/strict";
import test from "node:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { assistantTurnsIn, endedOnToolResults, looksLikePiTranscript, MAX_AGENT_TURNS, projectChat } from "./agent.ts";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function assistant(timestamp: number, withTool = false): AgentMessage {
  return {
    role: "assistant",
    content: withTool
      ? [{ type: "toolCall", id: String(timestamp), name: "x", arguments: {} }]
      : [{ type: "text", text: "ok" }],
    api: "openai-completions",
    provider: "p",
    model: "m",
    usage,
    stopReason: withTool ? "toolUse" : "stop",
    timestamp,
  };
}

test("looksLikePiTranscript 要求每条都有 role 与 timestamp", () => {
  assert.equal(looksLikePiTranscript([]), false);
  assert.equal(looksLikePiTranscript([{ role: "system", content: "hi" }]), false);
  assert.equal(looksLikePiTranscript([{ role: "system", content: "hi", timestamp: 1 }]), true);
  assert.equal(
    looksLikePiTranscript([
      { role: "user", content: "hi", timestamp: 1 },
      { role: "assistant", content: "ok" },
    ]),
    false,
  );
});

test("assistantTurnsIn 只数当前 run 的 assistant，不累计历史", () => {
  const history = Array.from({ length: MAX_AGENT_TURNS }, (_, i) => assistant(i + 1));
  const thisRun: AgentMessage[] = [
    { role: "user", content: "next", timestamp: 100 },
    assistant(101, true),
    {
      role: "toolResult",
      toolCallId: "101",
      toolName: "x",
      content: [{ type: "text", text: "r" }],
      isError: false,
      timestamp: 102,
    },
  ];
  assert.equal(assistantTurnsIn(history), MAX_AGENT_TURNS);
  assert.equal(assistantTurnsIn(thisRun), 1);
  assert.equal(assistantTurnsIn(thisRun) >= MAX_AGENT_TURNS, false);
  const tenTurnRun = Array.from({ length: MAX_AGENT_TURNS }, (_, i) => assistant(200 + i));
  assert.equal(assistantTurnsIn(tenTurnRun) >= MAX_AGENT_TURNS, true);
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

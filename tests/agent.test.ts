import assert from "node:assert/strict";
import test from "node:test";
import { Agent, type ReplayMessage } from "../src/core/agent.ts";
import type { LLM, LLMResponse } from "../src/core/llm.ts";
import { ToolContext, ToolRegistry } from "../src/core/tools.ts";
import { Tracer } from "../src/core/trace.ts";
import { loadConfig } from "../src/lib/config.ts";

/**脚本化 LLM：按队列出队响应，模拟多轮工具调用。 */
class ScriptedLlm implements LLM {
  private _script: LLMResponse[];
  constructor(script: LLMResponse[]) {
    this._script = [...script];
  }
  chat(): Promise<LLMResponse> {
    const step = this._script.shift();
    if (step === undefined) throw new Error("script exhausted");
    return Promise.resolve(step);
  }
}

function makeAgent(llm: LLM, maxTurns = 10): Agent {
  const tracer = new Tracer({ sessionId: "t" });
  return new Agent(llm, new ToolRegistry([]), "sys", tracer, maxTurns);
}

test("restore + 投影：恢复的回放历史就是模型将看到的历史", async () => {
  const agent = makeAgent(new ScriptedLlm([{ content: "你好", toolCalls: [], reasoning: null }]));
  const history: ReplayMessage[] = [
    { role: "system", content: "sys" },
    { role: "user", content: "早" },
    { role: "assistant", content: "", tool_calls: [{ id: "c1" }] },
    { role: "tool", tool_call_id: "c1", content: "r" },
    { role: "assistant", content: "结果如下" },
  ];
  agent.restore(history);
  const reply = await agent.run("继续", new ToolContext("t", new Tracer({ sessionId: "t" }), loadConfig()));
  assert.equal(reply, "你好");
  const messages = agent.messages;
  assert.equal(messages.length, history.length + 2); // 原 5 条 + 新 user + 新 assistant
  assert.equal(messages[0].role, "system");
  // 与 UI 投影同语义：只含有正文的 user/assistant 消息（工具中转的空 content 不算）
  assert.deepEqual(
    messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content !== "")
      .map((m) => m.content),
    ["早", "结果如下", "继续", "你好"],
  );
});

test("noteAssistant：中断收口的回复进入回放历史", () => {
  const agent = makeAgent(new ScriptedLlm([]));
  agent.noteAssistant("[error] 这一轮助手没有跑完");
  const last = agent.messages[agent.messages.length - 1];
  assert.equal(last.role, "assistant");
  assert.equal(last.content, "[error] 这一轮助手没有跑完");
});

test("预算耗尽：[budget] 回复也作为 assistant 消息入史", async () => {
  // 每轮都要求调工具 → 撞 maxTurns 上限
  const looping = (): LLMResponse => ({
    content: null,
    reasoning: null,
    toolCalls: [{ id: "c", name: "nope", arguments: {}, argumentsJson: "{}" }],
  });
  const agent = makeAgent(
    new (class implements LLM {
      chat(): Promise<LLMResponse> {
        return Promise.resolve(looping());
      }
    })(),
    2,
  );
  const reply = await agent.run("go", new ToolContext("t", new Tracer({ sessionId: "t" }), loadConfig()));
  assert.match(reply, /^\[budget\]/);
  const messages = agent.messages;
  assert.equal(messages[messages.length - 1].role, "assistant");
  assert.equal(messages[messages.length - 1].content, reply);
});

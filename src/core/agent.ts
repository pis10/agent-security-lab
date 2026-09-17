/**靶场 Agent：Pi Agent 循环 + 轨迹映射。 */
import { Agent, type AgentMessage, type AgentTool, type AgentToolResult } from "@earendil-works/pi-agent-core";
import { contentText, type Model, type ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ChatMessage } from "../lib/contracts.ts";
import { getPiModels, requireLlm } from "./pi-runtime.ts";
import type { Tracer } from "./trace.ts";

export const MAX_AGENT_TURNS = 10;
export const BUDGET_NOTE = "[budget] max agent turns reached; stopping the loop";

const EMPTY_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function userText(message: AgentMessage): string {
  if (message.role !== "user") return "";
  return typeof message.content === "string" ? message.content : contentText(message.content);
}

function assistantText(message: AgentMessage): string | null {
  if (message.role !== "assistant") return null;
  const parts = message.content.filter((c) => c.type === "text").map((c) => c.text);
  const text = parts.join("");
  return text === "" ? null : text;
}

function assistantThinking(message: AgentMessage): string | null {
  if (message.role !== "assistant") return null;
  const parts = message.content.filter((c) => c.type === "thinking").map((c) => c.thinking);
  const text = parts.join("");
  return text === "" ? null : text;
}

function assistantToolCalls(message: AgentMessage): Array<{ name: string; arguments: Record<string, unknown> }> {
  if (message.role !== "assistant") return [];
  return message.content
    .filter((c) => c.type === "toolCall")
    .map((c) => ({ name: c.name, arguments: c.arguments as Record<string, unknown> }));
}

function toolResultText(result: AgentToolResult<unknown>): string {
  return contentText(result.content);
}

export function lastAssistantText(messages: readonly AgentMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const text = assistantText(messages[i]);
    if (text !== null) return text;
  }
  return "";
}

export function endedOnToolResults(messages: readonly AgentMessage[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "toolResult") continue;
    if (m.role === "assistant") return assistantToolCalls(m).length > 0;
    return false;
  }
  return false;
}

function looksLikePiMessage(value: unknown): value is AgentMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "role" in value &&
    typeof (value as { role?: unknown }).role === "string" &&
    typeof (value as { timestamp?: unknown }).timestamp === "number"
  );
}

/**像 Pi transcript：非空，且每条都有 role 与数字 timestamp。旧格式不转换。 */
export function looksLikePiTranscript(raw: unknown): raw is AgentMessage[] {
  return Array.isArray(raw) && raw.length > 0 && raw.every(looksLikePiMessage);
}

/**当前 run 已完成的 assistant turn 数（Pi `shouldStopAfterTurn` 的 `newMessages`）。 */
export function assistantTurnsIn(messages: readonly AgentMessage[]): number {
  return messages.filter((m) => m.role === "assistant").length;
}

/**有正文的 user/assistant 消息进聊天框。 */
export function projectChat(messages: readonly AgentMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      const content = userText(m);
      if (content !== "") out.push({ role: "user", content });
    } else if (m.role === "assistant") {
      const content = assistantText(m);
      if (content) out.push({ role: "assistant", content });
    }
  }
  return out;
}

export function appendAssistantNote(agent: Agent, text: string): void {
  const model: Model<string> = agent.state.model;
  agent.state.messages = [
    ...agent.state.messages,
    {
      role: "assistant",
      content: [{ type: "text", text }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: EMPTY_USAGE,
      stopReason: "stop",
      timestamp: Date.now(),
    },
  ];
}

export function attachTracer(agent: Agent, tracer: Tracer): () => void {
  return agent.subscribe((event) => {
    if (event.type === "message_end") {
      const m = event.message;
      if (m.role === "user") {
        tracer.record("user_msg", { content: userText(m) });
      } else if (m.role === "assistant") {
        tracer.record("model_msg", {
          content: assistantText(m),
          reasoning: assistantThinking(m),
          tool_calls: assistantToolCalls(m),
        });
      }
    } else if (event.type === "tool_execution_start") {
      tracer.record("tool_call", { id: event.toolCallId, name: event.toolName, arguments: event.args });
    } else if (event.type === "tool_execution_end") {
      tracer.record("tool_result", {
        id: event.toolCallId,
        name: event.toolName,
        result: toolResultText(event.result).slice(0, 4000),
      });
    }
  });
}

export async function createLabAgent(opts: {
  systemPrompt: string;
  tools: AgentTool[];
  thinkingLevel: ModelThinkingLevel;
  temperature: number;
  messages?: AgentMessage[];
}): Promise<Agent> {
  const model = await requireLlm();
  const models = getPiModels();
  return new Agent({
    initialState: {
      systemPrompt: opts.systemPrompt,
      model,
      thinkingLevel: opts.thinkingLevel,
      tools: opts.tools,
      messages: opts.messages,
    },
    streamFn: (m, context, options) => models.streamSimple(m, context, { ...options, temperature: opts.temperature }),
    toolExecution: "sequential",
    shouldStopAfterTurn: ({ newMessages }) => assistantTurnsIn(newMessages) >= MAX_AGENT_TURNS,
  });
}

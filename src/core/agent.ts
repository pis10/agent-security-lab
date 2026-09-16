/**靶标共用的 tool-calling 循环。脆弱点在产品和工具配置。 */
import type { LLMClient, LLMResponse } from "./llm.ts";
import type { ToolContext, ToolRegistry } from "./tools.ts";
import type { Tracer } from "./trace.ts";

export interface ReplayMessage {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
}

function assistantToolMsg(resp: LLMResponse): ReplayMessage {
  return {
    role: "assistant",
    content: resp.content ?? "",
    tool_calls: resp.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.argumentsJson },
    })),
  };
}

export class Agent {
  llm: LLMClient;
  tools: ToolRegistry;
  tracer: Tracer;
  maxTurns: number;
  private _messages: ReplayMessage[];

  constructor(llm: LLMClient, tools: ToolRegistry, systemPrompt: string, tracer: Tracer, maxTurns = 10) {
    this.llm = llm;
    this.tools = tools;
    this.tracer = tracer;
    this.maxTurns = maxTurns;
    this._messages = [{ role: "system", content: systemPrompt }];
  }

  get messages(): ReplayMessage[] {
    return [...this._messages];
  }

  /**用持久化的完整回放消息替换内部历史（含 system 位；恢复世界时使用）。 */
  restore(messages: ReplayMessage[]): void {
    this._messages = [...messages];
  }

  /**向回放历史追加一条助手消息。 */
  noteAssistant(content: string): void {
    this._messages.push({ role: "assistant", content });
  }

  async run(userMessage: string, ctx: ToolContext): Promise<string> {
    this.tracer.record("user_msg", { content: userMessage });
    this._messages.push({ role: "user", content: userMessage });

    for (let turn = 0; turn < this.maxTurns; turn++) {
      const resp = await this.llm.chat(
        this._messages,
        this.tools.schemas().length > 0 ? this.tools.schemas() : undefined,
      );
      this.tracer.record("model_msg", {
        content: resp.content,
        reasoning: resp.reasoning,
        tool_calls: resp.toolCalls.map((tc) => ({ name: tc.name, arguments: tc.arguments })),
      });
      if (resp.toolCalls.length === 0) {
        const final = resp.content ?? "";
        this._messages.push({ role: "assistant", content: final });
        return final;
      }

      this._messages.push(assistantToolMsg(resp));
      for (const tc of resp.toolCalls) {
        this.tracer.record("tool_call", { id: tc.id, name: tc.name, arguments: tc.arguments });
        const result = await this.tools.call(tc.name, tc.arguments, ctx);
        this.tracer.record("tool_result", { id: tc.id, name: tc.name, result: result.slice(0, 4000) });
        this._messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: tc.name,
          content: result,
        });
      }
    }

    const note = "[budget] max tool turns reached; stopping the loop";
    this.tracer.record("note", { text: note });
    this._messages.push({ role: "assistant", content: note });
    return note;
  }
}

/**工具上下文与 AgentTool 声明助手。参数校验交给 TypeBox。 */
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Static, TSchema } from "@earendil-works/pi-ai";
import type { Config } from "../lib/config.ts";
import type { Tracer } from "./trace.ts";

export class ToolContext {
  /**每次会话交给每个工具调用的状态。 */
  sessionId: string;
  tracer: Tracer;
  config: Config;
  state: Record<string, unknown>;

  constructor(sessionId: string, tracer: Tracer, config: Config, state: Record<string, unknown> = {}) {
    this.sessionId = sessionId;
    this.tracer = tracer;
    this.config = config;
    this.state = state;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.config.port}`;
  }
}

/**当前会话已开启的防护集合（工具据此强制执行并记录 policy_blocked）。 */
export function defensesOf(ctx: ToolContext): Set<string> {
  const d = ctx.state.defenses;
  return d instanceof Set ? d : new Set<string>();
}

export function textResult(text: string): AgentToolResult<Record<string, never>> {
  return { content: [{ type: "text", text }], details: {} };
}

/**把业务 handler 包成 Pi AgentTool。业务结果返回字符串；执行异常由 handler throw。 */
export function agentTool<T extends TSchema>(
  ctx: ToolContext,
  spec: {
    name: string;
    description: string;
    parameters: T;
    run: (params: Static<T>, ctx: ToolContext) => Promise<string> | string;
  },
): AgentTool<T> {
  return {
    name: spec.name,
    label: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    execute: async (_id, params) => textResult(await spec.run(params, ctx)),
  };
}

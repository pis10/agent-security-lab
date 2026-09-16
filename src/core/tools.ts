/**交给模型的工具。description 原样进上下文。 */
import { z } from "zod";
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

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => string | Promise<string>;

export interface Tool {
  name: string;
  description: string;
  /**JSON Schema object */
  parameters: Record<string, unknown>;
  /**运行时参数校验；缺省则原样透传 */
  argSchema?: z.ZodType;
  handler: ToolHandler;
}

export function toolSchema(t: Tool): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  };
}

export class ToolRegistry {
  private _tools = new Map<string, Tool>();

  constructor(tools: Tool[] = []) {
    for (const t of tools) this.register(t);
  }

  register(tool: Tool): void {
    this._tools.set(tool.name, tool);
  }

  get names(): string[] {
    return [...this._tools.keys()];
  }

  schemas(): Record<string, unknown>[] {
    return [...this._tools.values()].map(toolSchema);
  }

  async call(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<string> {
    const tool = this._tools.get(name);
    if (tool === undefined) {
      return `[error] unknown tool: ${name}. Available: ${this.names.join(", ")}`;
    }
    if (tool.argSchema) {
      const parsed = tool.argSchema.safeParse(args);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        return `[error] tool ${name} 参数不合法: ${issues}`;
      }
      args = parsed.data as Record<string, unknown>;
    }
    try {
      const result = await tool.handler(args, ctx);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `[error] tool ${name} failed: ${msg}`;
    }
  }
}

// parameters：strict JSON Schema。zod 4 的 description 走 .describe()/strProp；去掉 $schema。

function objSchema(properties: Record<string, z.ZodType>): Record<string, unknown> {
  const out = z.toJSONSchema(z.strictObject(properties)) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

/**parameters：strict JSON Schema；argSchema：宽松 object，未知键剥离。 */
export function toolParams(properties: Record<string, z.ZodType>): Pick<Tool, "parameters" | "argSchema"> {
  return { parameters: objSchema(properties), argSchema: z.object(properties) };
}

export const strProp = (description: string) => z.string().describe(description);

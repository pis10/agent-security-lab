/**工具模型：一个工具就是交给模型的一项真实能力。
 *
 * 安全说明（设计使然）：`description` 是攻击面的一部分——它会原样
 * 展示给模型，并在 MCP 场景里可能被投毒。
 */
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
    // 自引用地址统一在这一个点构造：dev/prod/docker 都以标准 PORT 为准
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
  /**JSON Schema object（zod 经 objSchema 构建，或 MCP 原样透传） */
  parameters: Record<string, unknown>;
  /**运行时参数校验（toolParams 一并构建）；缺省（如 MCP 桥接工具）则原样透传 */
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
      // 模型给的参数先过 zod：类型校验 + 剥离未知键，handler 不再拿裸 as string
      const parsed = tool.argSchema.safeParse(args);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        // 参数错误回流给模型，让它自我纠正后重试
        return `[error] tool ${name} 参数不合法: ${issues}`;
      }
      args = parsed.data as Record<string, unknown>;
    }
    try {
      const result = await tool.handler(args, ctx);
      return result;
    } catch (exc) {
      // 工具错误原样回流给模型——真实应用也是如此
      const msg = exc instanceof Error ? exc.message : String(exc);
      return `[error] tool ${name} failed: ${msg}`;
    }
  }
}

// ── schema 助手：zod 一份定义同时充当 TS 类型、运行时校验与 LLM tool JSON Schema ──
// 注意：zod 4 里 description 必须用 .describe()/strProp（构造参数里的 description 不进 JSON Schema）；
// 输出剥掉 $schema 声明头，保持 wire 格式稳定（strict object + additionalProperties: false）。

export function objSchema(properties: Record<string, z.ZodType>): Record<string, unknown> {
  const out = z.toJSONSchema(z.strictObject(properties)) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

/**工具参数一步到位：给模型的 JSON Schema 用 strict（多一个键都拒绝），运行时解析用宽松
 * object（未知键静默剥离，避免模型夹带无害多余字段导致工具整体失败）。 */
export function toolParams(properties: Record<string, z.ZodType>): Pick<Tool, "parameters" | "argSchema"> {
  return { parameters: objSchema(properties), argSchema: z.object(properties) };
}

export const strProp = (description: string) => z.string().describe(description);

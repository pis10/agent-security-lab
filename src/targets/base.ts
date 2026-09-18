/**靶标：系统提示词、工具、种子和可选的产品 UI 状态。 */
import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolContext } from "../core/tools.ts";

/**可开关的加固。工具在 `ctx.state.defenses` 里检查，拦下时记 policy_blocked。 */
export interface Defense {
  id: string;
  name: string;
  description: string;
}

export interface Target {
  id: string;
  name: string;
  tierFocus: string;
  systemPrompt: string;
  buildTools: (ctx: ToolContext) => AgentTool[] | Promise<AgentTool[]>;
  seed?: (ctx: ToolContext) => void | Promise<void>;
  onSessionStart?: (ctx: ToolContext) => void | Promise<void>;
  onSessionEnd?: (ctx: ToolContext) => void | Promise<void>;
  defenses: Defense[];
  simState: (ctx: ToolContext) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
  act?: (ctx: ToolContext, action: string, args: Record<string, unknown>) => Record<string, unknown>;
}

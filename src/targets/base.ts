/**靶标契约：一个"故意脆弱"的 agent 应用。
 *
 * Target 捆绑系统提示词、工具集、种子/生命周期钩子与可选的产品 UI 状态。
 * 靶场 UI 为每个靶标保留一个持久世界（data/runtime/worlds/<id>/）；
 * seed() 在文件已存在时只挂载、缺失时才从种子复制。
 */
import type { Tool, ToolContext } from "../core/tools.ts";

/**一项可开关的加固措施。工具在 `ctx.state["defenses"]` 中检查它，
 * 拦下动作时必须记录 `policy_blocked` 轨迹事件。 */
export interface Defense {
  id: string;
  name: string;
  description: string;
}

export interface Target {
  id: string;
  name: string;
  tierFocus: string; // 该靶标演练的攻击面
  description: string;
  systemPrompt: string;
  buildTools: (ctx: ToolContext) => Tool[] | Promise<Tool[]>;
  seed?: (ctx: ToolContext) => void | Promise<void>;
  onSessionStart?: (ctx: ToolContext) => void | Promise<void>;
  onSessionEnd?: (ctx: ToolContext) => void | Promise<void>;
  defenses: Defense[];
  simState: (ctx: ToolContext) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>; // 仿真产品 UI 数据
  act?: (ctx: ToolContext, action: string, args: Record<string, unknown>) => Record<string, unknown>; // 玩家写操作
}

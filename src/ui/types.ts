/**UI 类型。wire 形状来自 lib/contracts.ts；SimProps 是仿真产品回调。 */
import type { ChatMessage } from "../lib/contracts.ts";

export * from "../lib/contracts.ts";

export interface SimProps {
  simState: Record<string, unknown>;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  onAct?: (action: string, args: Record<string, unknown>) => Promise<Record<string, unknown> | void>;
  onResetChat?: () => void;
  busy: boolean;
}

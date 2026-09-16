/**UI 类型一律取自 shared/contracts.ts（前后端单一副本）；SimProps 是纯前端关注点。 */
import type { ChatMessage } from "../shared/contracts.ts";

export * from "../shared/contracts.ts";

export interface SimProps {
  simState: Record<string, any>;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  onAct?: (action: string, args: Record<string, unknown>) => Promise<void>;
  onResetChat?: () => void;
  busy: boolean;
}

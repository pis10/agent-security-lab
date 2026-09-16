/**场景领域逻辑：任务书拆解。wire 类型在 shared/contracts.ts 单一维护。 */
import type { Scenario } from "../shared/contracts.ts";

export type { Scenario };

export const GOAL_MARK = "解决本关：";

/**任务书末行「解决本关：」之后的目标句；没写标记则退回整段。 */
export function scenarioGoal(s: Scenario): string {
  const idx = s.brief.lastIndexOf(GOAL_MARK);
  return idx >= 0 ? s.brief.slice(idx + GOAL_MARK.length).trim() : s.brief.trim();
}

/**「解决本关：」之前的场景与要点。 */
export function scenarioContext(s: Scenario): string {
  const idx = s.brief.lastIndexOf(GOAL_MARK);
  return idx >= 0 ? s.brief.slice(0, idx).trim() : "";
}

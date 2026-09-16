import type { Assertion } from "../core/flags.ts";
import type { Defense } from "../targets/base.ts";

/**场景契约（字段名与旧 YAML/前端 wire 格式保持一致，snake_case）。 */
export interface Scenario {
  id: string;
  target: string;
  tier: string; // L1 单点 .. L5 组合链
  title: string;
  /**一段式任务书：场景与要点若干行，末行固定「解决本关：…」（含 flag 工件） */
  brief: string;
  /**开课即亮出的漏洞类别 */
  vuln_class: string;
  hints: string[];
  /**只认副作用；label 就是「通关判定」checklist 的文案 */
  assertions: Assertion[];
  /**本关防护（须为靶标 Target.defenses 的子集） */
  defenses: Defense[];
  /**通关后解锁的一整篇，统一骨架：背景原理 / 攻击链复盘 / 防守复测 / 修复对照 */
  writeup: string;
}

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

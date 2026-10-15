/**服务端页面数据：产品目录、课程、进度、世界摘要。 */

import { scenarioForLearner } from "../core/teaching.ts";
import { SCENARIOS } from "../scenarios/index.ts";
import { listTargets, toTargetInfo } from "../targets/registry.ts";
import { getWorldManager } from "../world/manager.ts";
import { loadConfig } from "./config.ts";
import type { Meta, ProgressMap, Scenario, TargetInfo, WorldInfo } from "./contracts.ts";

export function llmMeta(): Meta {
  const config = loadConfig();
  return { llm_model: `${config.llmProvider}/${config.llmModel}` };
}

/**页面数据用到的登录者字段。 */
interface Viewer {
  id: number;
  is_admin: boolean;
}

export function catalogData(viewer: Viewer): {
  targets: TargetInfo[];
  scenarios: Scenario[];
  progress: ProgressMap;
  meta: Meta;
} {
  return {
    targets: listTargets().map(toTargetInfo),
    scenarios: SCENARIOS.map((s) => learnerScenario(s, viewer)),
    progress: getWorldManager().progress.captured(viewer.id),
    meta: llmMeta(),
  };
}

export function worldSummaries(userId: number): WorldInfo[] {
  return getWorldManager()
    .list(userId)
    .map(({ messages: _messages, ...rest }) => rest);
}

/**在服务端裁掉答案，覆盖目录、课程及产品页的 RSC 数据。 */
export function learnerScenario(scenario: Scenario, viewer: Viewer): Scenario {
  const answersVisible = getWorldManager().progress.answersVisible();
  return scenarioForLearner(scenario, { answersVisible, isAdmin: viewer.is_admin });
}

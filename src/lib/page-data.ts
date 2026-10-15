/**服务端页面数据：产品目录、课程、进度、世界摘要。 */

import { llmLabel, llmView } from "../core/llm.ts";
import { getSettingsDb } from "../core/settings.ts";
import { scenarioForLearner } from "../core/teaching.ts";
import { SCENARIOS } from "../scenarios/index.ts";
import { listTargets, toTargetInfo } from "../targets/registry.ts";
import { getWorldManager } from "../world/manager.ts";
import { getAccountsDb } from "./auth.ts";
import type { LlmSettingsView, Meta, ProgressMap, Scenario, TargetInfo, WorldInfo } from "./contracts.ts";

export function llmMeta(): Meta {
  return { llm_model: llmLabel() };
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
  const answersVisible = getSettingsDb().answersVisible();
  return scenarioForLearner(scenario, { answersVisible, isAdmin: viewer.is_admin });
}

/**模型设置页与接口用：已保存的配置（不含 Key）及最后修改人。 */
export function llmSettingsView(): LlmSettingsView | null {
  const stored = getSettingsDb().llm();
  if (!stored) return null;
  let updatedBy: string | null = null;
  if (stored.updated_by !== null) {
    try {
      updatedBy = getAccountsDb().getUser(stored.updated_by).username;
    } catch {
      /* 修改人已删除 */
    }
  }
  return llmView(stored, updatedBy);
}

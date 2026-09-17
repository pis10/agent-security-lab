/**服务端页面数据：产品目录、课程、进度、世界摘要。 */

import { SCENARIOS } from "../scenarios/index.ts";
import { listTargets, toTargetInfo } from "../targets/registry.ts";
import { getProgressDb, getWorldManager } from "../world/manager.ts";
import { loadConfig } from "./config.ts";
import type { Meta, ProgressMap, Scenario, TargetInfo, WorldInfo } from "./contracts.ts";

export function llmMeta(): Meta {
  const config = loadConfig();
  return { llm_model: `${config.llmProvider}/${config.llmModel}` };
}

export function catalogData(): {
  targets: TargetInfo[];
  scenarios: Scenario[];
  progress: ProgressMap;
  meta: Meta;
} {
  return {
    targets: listTargets().map(toTargetInfo),
    scenarios: SCENARIOS,
    progress: getProgressDb().captured(),
    meta: llmMeta(),
  };
}

export function worldSummaries(): WorldInfo[] {
  return getWorldManager()
    .list()
    .map(({ messages: _messages, ...rest }) => rest);
}

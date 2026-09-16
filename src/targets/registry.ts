import type { Target } from "./base.ts";
import { browserAgent } from "./browser_agent.ts";
import { devopsAssistant } from "./devops_assistant.ts";
import { mailAgent } from "./mail_agent.ts";
import { mcpPlayground } from "./mcp_playground.ts";
import { supportBot } from "./support_bot.ts";

const _TARGETS: Target[] = [supportBot, devopsAssistant, mailAgent, mcpPlayground, browserAgent];
const _TARGET_IDS = _TARGETS.map((t) => t.id);

export function getTarget(targetId: string): Target {
  const target = _TARGETS.find((t) => t.id === targetId);
  if (target === undefined) {
    throw new Error(`unknown target '${targetId}'; available: ${_TARGET_IDS.join(", ")}`);
  }
  return target;
}

export function listTargets(): Target[] {
  return _TARGETS;
}

export { browserAgent, devopsAssistant, mailAgent, mcpPlayground, supportBot };

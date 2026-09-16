import { NotFoundError } from "../core/errors.ts";
import type { TargetInfo } from "../lib/contracts.ts";
import type { Target } from "./base.ts";
import { devopsAssistant } from "./devops_assistant.ts";
import { mailAgent } from "./mail_agent.ts";
import { mcpPlayground } from "./mcp_playground.ts";
import { supportBot } from "./support_bot.ts";

const TARGETS: Target[] = [devopsAssistant, supportBot, mailAgent, mcpPlayground];

export function findTarget(targetId: string): Target | null {
  return TARGETS.find((t) => t.id === targetId) ?? null;
}

export function getTarget(targetId: string): Target {
  const target = findTarget(targetId);
  if (target === null) {
    throw new NotFoundError(`unknown target '${targetId}'; available: ${TARGETS.map((t) => t.id).join(", ")}`);
  }
  return target;
}

export function listTargets(): Target[] {
  return TARGETS;
}

export function toTargetInfo(t: Target): TargetInfo {
  return {
    id: t.id,
    name: t.name,
    tier_focus: t.tierFocus,
    defenses: t.defenses,
  };
}

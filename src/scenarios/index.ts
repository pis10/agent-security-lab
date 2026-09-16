import { BadRequestError, NotFoundError } from "../core/errors.ts";
import { cmdInjection } from "./cmd-injection.ts";
import { memoryPoisoning } from "./memory-poisoning.ts";
import { ssrfCloudMetadata } from "./ssrf-cloud-metadata.ts";
import { ticketIdor } from "./ticket-idor.ts";
import { tokenAudience } from "./token-audience.ts";
import type { Scenario } from "./types.ts";

/**按 tier 升序的学习路径。 */
export const SCENARIOS: Scenario[] = [cmdInjection, memoryPoisoning, ssrfCloudMetadata, ticketIdor, tokenAudience];

export function loadScenarios(): Scenario[] {
  return SCENARIOS;
}

export function getScenario(scenarioId: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === scenarioId) ?? null;
}

/**场景必须存在；传入 targetId 时还要求场景属于该靶标。 */
export function requireScenario(scenarioId: string, targetId?: string): Scenario {
  const scenario = getScenario(scenarioId);
  if (scenario === null) {
    throw new NotFoundError(`unknown scenario '${scenarioId}'`);
  }
  if (targetId !== undefined && scenario.target !== targetId) {
    throw new BadRequestError(`场景 '${scenarioId}' 属于靶标 '${scenario.target}'，不能用于 '${targetId}'`);
  }
  return scenario;
}

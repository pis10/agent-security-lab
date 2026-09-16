import { cmdInjection } from "./cmd-injection.ts";
import { memoryPoisoning } from "./memory-poisoning.ts";
import { ssrfCloudMetadata } from "./ssrf-cloud-metadata.ts";
import { ticketIdor } from "./ticket-idor.ts";
import { tokenAudience } from "./token-audience.ts";
import type { Scenario } from "./types.ts";

/**顺序与旧版 YAML 目录扫描一致（按文件名排序）。 */
export const SCENARIOS: Scenario[] = [cmdInjection, memoryPoisoning, ssrfCloudMetadata, ticketIdor, tokenAudience];

export function loadScenarios(): Scenario[] {
  return SCENARIOS;
}

export function getScenario(scenarioId: string): Scenario | null {
  return SCENARIOS.find((s) => s.id === scenarioId) ?? null;
}

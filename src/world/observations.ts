/**观测判定：对世界跑场景断言、记录通关进度。 */
import { evaluate } from "../core/flags.ts";
import { SINKS } from "../core/sinks.ts";
import { defensesOf } from "../core/tools.ts";
import { assertionLabel, type Observation, type ObservationCheck } from "../lib/contracts.ts";
import type { Scenario } from "../scenarios/types.ts";
import type { World } from "./manager.ts";
import { getProgressDb } from "./manager.ts";

export type { Observation, ObservationCheck };

export function evaluateScenario(world: World, scenario: Scenario): Observation {
  const results = evaluate(scenario.assertions, world.tracer, SINKS, world.targetId);
  const passed = results.length > 0 && results.every((r) => r.passed);
  if (passed) {
    const progressDb = getProgressDb();
    const already = scenario.id in progressDb.captured();
    progressDb.recordCapture(scenario.id, world.targetId, [...defensesOf(world.ctx)].sort());
    if (!already) {
      console.info(`课程通关: ${scenario.id} (world ${world.targetId})`);
    }
  }
  const checks: ObservationCheck[] = results.map((r) => ({
    label: assertionLabel(r.assertion) ?? r.detail,
    passed: r.passed,
  }));
  return {
    scenario_id: scenario.id,
    title: scenario.title,
    tier: scenario.tier,
    passed,
    passed_count: results.filter((r) => r.passed).length,
    total: results.length,
    checks,
  };
}

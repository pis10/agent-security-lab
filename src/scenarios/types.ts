/**场景领域逻辑。wire 类型在 lib/contracts.ts。 */
import type { Scenario } from "../lib/contracts.ts";

export type { Scenario };

export function tierRank(tier: string): number {
  return Number.parseInt(tier.replace(/\D/g, ""), 10) || 0;
}

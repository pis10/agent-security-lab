/**前后端共享的 wire 契约（单一副本）：API 响应形状 + 断言 label 提取。
 *
 * 服务端（manager/observations/scenarios）与 UI 都从这里取类型；
 * UI 的浏览器 API client（ui/api.ts）不是重复契约，是消费方。
 */

export interface Meta {
  llm_model: string;
}

export interface DefenseInfo {
  id: string;
  name: string;
  description: string;
}

export interface TargetInfo {
  id: string;
  name: string;
  tier_focus: string;
  description: string;
  defenses: DefenseInfo[];
}

export type Assertion = Record<string, unknown>;

export interface Scenario {
  id: string;
  target: string;
  tier: string;
  title: string;
  vuln_class: string;
  brief: string;
  hints: string[];
  assertions: Assertion[];
  defenses: DefenseInfo[];
  writeup: string;
}

export interface TraceEvent {
  ts: number;
  session_id: string;
  kind: string;
  data: Record<string, unknown>;
}

export interface SinkEvent {
  ts: number;
  session_id: string;
  channel: string;
  payload: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WorldInfo {
  target_id: string;
  scenario_id: string | null;
  created: number;
  enabled_defenses: string[];
  event_count: number;
  sink_count: number;
  messages?: ChatMessage[];
}

export interface ObservationCheck {
  label: string;
  passed: boolean;
}

export interface Observation {
  scenario_id: string;
  title: string;
  tier: string;
  passed: boolean;
  passed_count: number;
  total: number;
  checks: ObservationCheck[];
}

export type ProgressMap = Record<string, { session_id: string; defenses: string[]; captured_at: number }>;

/**断言里可选的 label：UI checklist 文案；没有 label 时由调用方退回 detail/默认文案。 */
export function assertionLabel(assertion: Assertion): string | null {
  const spec = Object.values(assertion)[0];
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const label = (spec as Record<string, unknown>).label;
    return typeof label === "string" ? label : null;
  }
  return null;
}

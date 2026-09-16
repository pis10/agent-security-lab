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

export interface Scenario {
  id: string;
  target: string;
  tier: string;
  title: string;
  vuln_class: string;
  brief: string;
  hints: string[];
  assertions: Record<string, Record<string, any>>[];
  defenses: DefenseInfo[];
  writeup: string;
}

export function assertionLabel(assertion: Record<string, Record<string, any>>): string {
  const spec = Object.values(assertion)[0];
  return (spec && typeof spec === "object" && spec.label) || "";
}

export interface TraceEvent {
  ts: number;
  session_id: string;
  kind: string;
  data: Record<string, any>;
}

export interface SinkEvent {
  ts: number;
  session_id: string;
  channel: string;
  payload: Record<string, any>;
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

export type ProgressMap = Record<
  string,
  { session_id: string; defenses: string[]; captured_at: number }
>;

export interface SimProps {
  simState: Record<string, any>;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  onAct?: (action: string, args: Record<string, unknown>) => Promise<void>;
  onResetChat?: () => void;
  busy: boolean;
}

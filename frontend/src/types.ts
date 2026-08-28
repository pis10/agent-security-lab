export interface Meta {
  llm_mode: "mock" | "live";
  llm_model: string | null;
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
  briefing: string;
  hints: string[];
  assertions: Record<string, unknown>[];
  defenses: DefenseInfo[];
  writeup: string;
  fix_notes: string;
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

export interface CheckItem {
  assertion: Record<string, any>;
  passed: boolean;
  detail: string;
}

export interface CheckResult {
  scenario_id: string;
  passed: boolean;
  results: CheckItem[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ProgressMap = Record<
  string,
  { session_id: string; defenses: string[]; captured_at: number }
>;

/** Contract between Workspace (owns all API/polling/session lifecycle) and a
 * per-target simulated product UI (renders the product, sends attack inputs). */
export interface SimProps {
  sessionId: string;
  simState: Record<string, any>;
  messages: ChatMessage[];
  onSend: (message: string) => void;
  busy: boolean;
}

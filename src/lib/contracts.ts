/**API 与 UI 共用的 wire 类型，以及断言 label 提取。 */

export interface Meta {
  /**当前模型 `provider/model`；null 表示管理员还没配置。 */
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
  defenses: DefenseInfo[];
}

export type Assertion = Record<string, unknown>;

export interface Scenario {
  id: string;
  target: string;
  tier: string;
  title: string;
  vuln_class: string;
  /**这一类漏洞在本产品里怎么出现。 */
  principle: string;
  /**可检测的成功条件。 */
  goal: string;
  /**逐步做法，卡住时再看。 */
  solution?: string;
  hints: string[];
  assertions: Assertion[];
  /**防护实际作用的工具：开启全部防护后本轮调用过其中之一，才记一次复测。 */
  retest_tools: string[];
  defenses: DefenseInfo[];
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
  run_status: "idle" | "queued" | "running";
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

/**断言对象上的 label；没有则返回 null。 */
export function assertionLabel(assertion: Assertion): string | null {
  const spec = Object.values(assertion)[0];
  if (spec && typeof spec === "object" && !Array.isArray(spec)) {
    const label = (spec as Record<string, unknown>).label;
    return typeof label === "string" ? label : null;
  }
  return null;
}

/**登录会话 cookie 名。proxy 只看它在不在，真正的校验在各页面与接口里。 */
export const SESSION_COOKIE = "asl_session";

/**登录账号（前端可见字段）。 */
export interface PublicUser {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
}

/**账号管理页的一行：不含密码哈希，附已通关课程数。 */
export interface AdminUser extends PublicUser {
  disabled: boolean;
  created_at: number;
  last_login_at: number | null;
  captured: number;
}

/**新密码最短长度，前后端共用。 */
export const MIN_PASSWORD_LENGTH = 8;

/**403 时附带的 code：须先修改初始密码。 */
export const PASSWORD_CHANGE_REQUIRED = "password_change_required";

/**503 时附带的 code：管理员还没在网页上配置模型。 */
export const LLM_NOT_CONFIGURED = "llm_not_configured";

/**内置厂商走 Pi 包内目录；另两种是自建服务的协议。 */
export const LLM_KINDS = ["builtin", "openai-completions", "anthropic-messages"] as const;
export type LlmKind = (typeof LLM_KINDS)[number];

export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/**自建 OpenAI 兼容服务的兼容开关，键名与取值即 Pi 的 compat 字段；不填为自动。 */
export interface LlmCompat {
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  supportsStore?: boolean;
  supportsDeveloperRole?: boolean;
  thinkingFormat?: "openai" | "deepseek" | "qwen" | "qwen-chat-template" | "chat-template";
}

/**模型设置表单。自建服务字段在内置厂商下忽略。 */
export interface LlmSettingsInput {
  kind: LlmKind;
  /**内置厂商的 Pi provider id。 */
  provider: string;
  model: string;
  base_url: string;
  /**留空：服务未变时沿用已保存的 Key。 */
  api_key?: string;
  /**自建服务不需要 Key 时清除已保存的 Key。 */
  clear_api_key?: boolean;
  thinking: ThinkingLevel;
  temperature: number;
  context_window: number;
  max_tokens: number;
  compat: LlmCompat;
  headers: Record<string, string>;
}

/**下发给设置页的已保存配置：Key 只给是否已设置与末四位。 */
export interface LlmSettingsView extends Omit<LlmSettingsInput, "api_key" | "clear_api_key"> {
  api_key_set: boolean;
  api_key_hint: string | null;
  updated_at: number;
  updated_by: string | null;
}

export interface LlmProviderInfo {
  id: string;
  name: string;
}

export interface LlmModelInfo {
  id: string;
  name: string;
  reasoning: boolean;
  context_window: number;
}

/**测试连接：发一次带工具的请求，看能否连通、是否会调用工具。 */
export interface LlmTestResult {
  ok: boolean;
  latency_ms: number;
  model: string;
  tool_call: boolean;
  reply: string | null;
  error: { category: string; message: string } | null;
}

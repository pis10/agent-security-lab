/**API 与 UI 共用的 wire 类型，以及断言 label 提取。 */

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
  solution: string;
  assertions: Assertion[];
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

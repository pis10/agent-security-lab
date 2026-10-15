import type { TeachingRow } from "../core/teaching.ts";
import {
  type AdminUser,
  type Observation,
  PASSWORD_CHANGE_REQUIRED,
  type ProgressMap,
  type PublicUser,
  type SinkEvent,
  type TraceEvent,
  type WorldInfo,
} from "./types";

export class ApiError extends Error {
  status: number;
  /**服务端返回的说明，表单直接展示。 */
  detail: string;
  constructor(status: number, body: string) {
    super(`${status} ${body}`);
    this.status = status;
    this.detail = body;
  }
}

/**表单错误提示：接口错误取服务端说明，其余取 message。 */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) return err.detail;
  return err instanceof Error ? err.message : String(err);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    let code = "";
    try {
      const parsed = JSON.parse(text) as { detail?: unknown; code?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
      if (typeof parsed.code === "string") code = parsed.code;
    } catch {
      /* keep raw */
    }
    // 会话失效回登录页、还没改初始密码去改密页；登录与改密接口自己的 401/403 照常抛给表单
    if (!path.startsWith("/api/auth/")) {
      if (res.status === 401) {
        const here = window.location.pathname + window.location.search;
        window.location.href = `/login?next=${encodeURIComponent(here)}`;
      } else if (res.status === 403 && code === PASSWORD_CHANGE_REQUIRED) {
        window.location.href = "/account/password";
      }
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

const PROGRESS_EVENT = "asl-progress";

export function notifyProgressChanged() {
  window.dispatchEvent(new Event(PROGRESS_EVENT));
}

export function onProgressChanged(handler: () => void) {
  window.addEventListener(PROGRESS_EVENT, handler);
  return () => window.removeEventListener(PROGRESS_EVENT, handler);
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  login: (username: string, password: string) =>
    req<{ user: PublicUser }>("/api/auth/login", post({ username, password })),
  logout: () => req<{ ok: true }>("/api/auth/logout", post()),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ user: PublicUser }>(
      "/api/auth/password",
      post({ current_password: currentPassword, new_password: newPassword }),
    ),
  teachingProgress: () => req<{ rows: TeachingRow[] }>("/api/admin/progress"),
  setAnswersVisible: (visible: boolean) =>
    req<{ answers_visible: boolean }>("/api/admin/settings", post({ answers_visible: visible })),
  adminUsers: () => req<{ users: AdminUser[] }>("/api/admin/users"),
  adminCreateUser: (username: string, displayName: string, isAdmin: boolean) =>
    req<{ user: AdminUser; initial_password: string }>(
      "/api/admin/users",
      post({ username, display_name: displayName, is_admin: isAdmin }),
    ),
  adminAction: (
    userId: number,
    action: "reset_password" | "reset_progress" | "disable" | "enable" | "grant_admin" | "revoke_admin",
  ) =>
    req<{ user: Omit<AdminUser, "captured">; initial_password?: string }>(
      `/api/admin/users/${userId}`,
      post({ action }),
    ),
  progress: () => req<ProgressMap>("/api/progress"),
  listWorlds: () => req<WorldInfo[]>("/api/worlds"),
  ensureWorld: (targetId: string, scenarioId: string | null) =>
    req<WorldInfo>(`/api/worlds/${targetId}`, {
      method: "POST",
      body: JSON.stringify({ scenario_id: scenarioId }),
    }),
  chat: (targetId: string, message: string) =>
    req<{ reply: string }>(`/api/worlds/${targetId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  chatMessages: (targetId: string) => req<WorldInfo>(`/api/worlds/${targetId}/chat`),
  act: (targetId: string, action: string, args: Record<string, unknown>) =>
    req<Record<string, unknown>>(`/api/worlds/${targetId}/act`, {
      method: "POST",
      body: JSON.stringify({ action, args }),
    }),
  clearChat: (targetId: string) => req<WorldInfo>(`/api/worlds/${targetId}/chat/reset`, { method: "POST" }),
  trace: (targetId: string) => req<TraceEvent[]>(`/api/worlds/${targetId}/trace`),
  sim: (targetId: string) => req<Record<string, unknown>>(`/api/worlds/${targetId}/sim`),
  sink: (targetId: string) => req<SinkEvent[]>(`/api/worlds/${targetId}/sink`),
  observations: (targetId: string) =>
    req<{ target_id: string; observations: Observation[] }>(`/api/worlds/${targetId}/observations`),
  setDefenses: (targetId: string, defenses: string[]) =>
    req<WorldInfo>(`/api/worlds/${targetId}/defenses`, {
      method: "POST",
      body: JSON.stringify({ enabled_defenses: defenses }),
    }),
  resetWorld: (targetId: string, scenarioId: string | null) =>
    req<WorldInfo>(`/api/worlds/${targetId}/reset`, {
      method: "POST",
      body: JSON.stringify({ scenario_id: scenarioId }),
    }).then((world) => {
      notifyProgressChanged();
      return world;
    }),
  resetAll: () =>
    req<{ ok: true }>("/api/reset", { method: "POST" }).then((body) => {
      notifyProgressChanged();
      return body;
    }),
};

import type { Meta, Observation, ProgressMap, Scenario, SinkEvent, TargetInfo, TraceEvent, WorldInfo } from "./types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`${status} ${body}`);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") detail = parsed.detail;
    } catch {
      /* keep raw */
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

export const api = {
  meta: () => req<Meta>("/api/meta"),
  targets: () => req<TargetInfo[]>("/api/targets"),
  scenarios: () => req<Scenario[]>("/api/scenarios"),
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
  sim: (targetId: string) => req<Record<string, any>>(`/api/worlds/${targetId}/sim`),
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
  reportUrl: (targetId: string, scenarioId: string) =>
    `/api/worlds/${targetId}/report?scenario_id=${encodeURIComponent(scenarioId)}`,
};

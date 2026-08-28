import type {
  CheckResult,
  Meta,
  ProgressMap,
  Scenario,
  SinkEvent,
  TargetInfo,
  TraceEvent,
} from "./types";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

export const api = {
  meta: () => req<Meta>("/api/meta"),
  targets: () => req<TargetInfo[]>("/api/targets"),
  scenarios: () => req<Scenario[]>("/api/scenarios"),
  progress: () => req<ProgressMap>("/api/progress"),
  createSession: (targetId: string, scenarioId: string | null, defenses: string[]) =>
    req<{ session_id: string }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        target_id: targetId,
        scenario_id: scenarioId,
        enabled_defenses: defenses,
      }),
    }),
  closeSession: (sid: string) => req(`/api/sessions/${sid}`, { method: "DELETE" }),
  chat: (sid: string, message: string) =>
    req<{ reply: string }>(`/api/sessions/${sid}/chat`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  trace: (sid: string) => req<TraceEvent[]>(`/api/sessions/${sid}/trace`),
  sim: (sid: string) => req<Record<string, any>>(`/api/sessions/${sid}/sim`),
  sink: (sid: string) => req<SinkEvent[]>(`/api/sessions/${sid}/sink`),
  check: (sid: string, scenarioId: string) =>
    req<CheckResult>(`/api/sessions/${sid}/check`, {
      method: "POST",
      body: JSON.stringify({ scenario_id: scenarioId }),
    }),
  reportUrl: (sid: string, scenarioId: string) =>
    `/api/sessions/${sid}/report?scenario_id=${encodeURIComponent(scenarioId)}`,
};

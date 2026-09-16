/**外发箱与假内网的共享状态。路由在 src/app/sink、src/app/internal。 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { SinkEvent } from "../lib/contracts.ts";

export type { SinkEvent };

export class SinkState {
  /**内存中的外发记录；挂上 JSONL 后跨重启留存。 */
  events: SinkEvent[] = [];
  private _logs = new Map<string, string>();

  attachLog(sessionId: string, logPath: string): void {
    this._logs.set(sessionId, logPath);
    if (!existsSync(logPath)) return;
    if (this.events.some((e) => e.session_id === sessionId)) return;
    for (const line of readFileSync(logPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const d = JSON.parse(line) as { ts: number; session_id: string; channel: string; payload?: unknown };
      this.events.push({
        ts: d.ts,
        session_id: d.session_id,
        channel: d.channel,
        payload: (d.payload as Record<string, unknown>) ?? {},
      });
    }
  }

  detachLog(sessionId: string): void {
    this._logs.delete(sessionId);
  }

  add(sessionId: string, channel: string, payload: Record<string, unknown>): SinkEvent {
    const ev: SinkEvent = { ts: Date.now() / 1000, session_id: sessionId, channel, payload };
    this.events.push(ev);
    const logPath = this._logs.get(sessionId);
    if (logPath !== undefined) {
      mkdirSync(path.dirname(logPath), { recursive: true });
      appendFileSync(logPath, `${JSON.stringify(ev)}\n`);
    }
    return ev;
  }

  received(opts: { channel?: string; sessionId?: string } = {}): SinkEvent[] {
    let events = [...this.events];
    if (opts.channel !== undefined) {
      events = events.filter((e) => e.channel === opts.channel);
    }
    if (opts.sessionId !== undefined) {
      events = events.filter((e) => e.session_id === opts.sessionId);
    }
    return events;
  }

  purgeSession(sessionId: string): void {
    this.events = this.events.filter((e) => e.session_id !== sessionId);
  }
}

export const SINKS = new SinkState();

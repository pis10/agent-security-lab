/**本机外发箱（sink inbox）与假内网端点的共享状态。
 *
 * sink 记录"真实攻击里会发出去的东西"。internal 路由扮演内网/云元数据。
 * 仅本地绑定；载荷均为 TEST_* 假数据。HTTP 路由在 app/sink 与 app/internal 下。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface SinkEvent {
  ts: number;
  session_id: string;
  channel: string; // email | http | internal
  payload: Record<string, unknown>;
}

export class SinkState {
  /**内存里记录所有打到外发箱的内容。
   *
   * 靶场世界挂上 JSONL 路径后，战利品跨进程重启留存。
   */
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

  reset(): void {
    this.events = [];
  }

  purgeSession(sessionId: string): void {
    this.events = this.events.filter((e) => e.session_id !== sessionId);
  }
}

export const SINKS = new SinkState();

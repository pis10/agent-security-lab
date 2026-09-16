/**轨迹记录：一个会话里每个安全相关事件，JSONL 持久化。
 *
 * 轨迹是关卡判定的 ground truth——flag 只看观测到的副作用，
 * 从不看模型嘴上说了什么。
 */

import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";

export interface TraceEvent {
  ts: number;
  session_id: string;
  kind: string;
  data: Record<string, unknown>;
}

export interface TracerOptions {
  sessionId?: string;
  traceDir?: string;
  path?: string;
}

export class Tracer {
  session_id: string;
  private _events: TraceEvent[] = [];
  private _fh: number | null = null;
  private _path: string | null;

  constructor(opts: TracerOptions = {}) {
    this.session_id = opts.sessionId ?? randomUUID().replace(/-/g, "").slice(0, 12);
    if (opts.path !== undefined) {
      this._path = opts.path;
    } else if (opts.traceDir !== undefined) {
      this._path = `${opts.traceDir}/${this.session_id}.jsonl`;
    } else {
      this._path = null;
    }
    if (this._path !== null) {
      mkdirSync(dirnameOf(this._path), { recursive: true });
      if (existsSync(this._path)) {
        for (const line of readFileSync(this._path, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const d = JSON.parse(line) as { ts: number; session_id: string; kind: string; data?: unknown };
          this._events.push({
            ts: d.ts,
            session_id: d.session_id,
            kind: d.kind,
            data: (d.data as Record<string, unknown>) ?? {},
          });
        }
      }
      this._fh = openSync(this._path, "a");
    }
  }

  record(kind: string, data: Record<string, unknown>): TraceEvent {
    const ev: TraceEvent = { ts: Date.now() / 1000, session_id: this.session_id, kind, data };
    this._events.push(ev);
    if (this._fh !== null) {
      writeSync(this._fh, `${JSON.stringify(ev)}\n`);
    }
    return ev;
  }

  get events(): TraceEvent[] {
    return [...this._events];
  }

  ofKind(kind: string): TraceEvent[] {
    return this._events.filter((e) => e.kind === kind);
  }

  toolCallEvents(name?: string): TraceEvent[] {
    let events = this.ofKind("tool_call");
    if (name !== undefined) {
      events = events.filter((e) => e.data.name === name);
    }
    return events;
  }

  close(): void {
    if (this._fh !== null) {
      closeSync(this._fh);
      this._fh = null;
    }
  }
}

function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx === -1 ? "." : p.slice(0, idx);
}

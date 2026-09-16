/**轨迹：会话内安全相关事件，JSONL。关卡判定读这里的副作用。 */

import { randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeSync } from "node:fs";
import path from "node:path";
import type { TraceEvent } from "../lib/contracts.ts";

export type { TraceEvent };

export interface TracerOptions {
  sessionId?: string;
  path?: string;
}

export class Tracer {
  session_id: string;
  private _events: TraceEvent[] = [];
  private _fh: number | null = null;
  private _path: string | null;

  constructor(opts: TracerOptions = {}) {
    this.session_id = opts.sessionId ?? randomUUID().replace(/-/g, "").slice(0, 12);
    this._path = opts.path ?? null;
    if (this._path !== null) {
      mkdirSync(path.dirname(this._path), { recursive: true });
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

  close(): void {
    if (this._fh !== null) {
      closeSync(this._fh);
      this._fh = null;
    }
  }
}

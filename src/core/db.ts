/**SQLite：进度库 progress.db，产品世界在 worlds/<target_id>/。每次短连接。 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PROJECT_ROOT } from "../lib/config.ts";
import type { ToolContext } from "./tools.ts";

export const RUNTIME_DIR = path.join(PROJECT_ROOT, "data", "runtime");
export const WORLDS_DIR = path.join(RUNTIME_DIR, "worlds");

/**本次运行的业务文件目录。靶场 UI 会设置 `ctx.state.world_dir`。 */
export function worldPath(ctx: ToolContext): string {
  const custom = ctx.state.world_dir;
  const p = typeof custom === "string" && custom ? custom : path.join(RUNTIME_DIR, ctx.sessionId);
  mkdirSync(p, { recursive: true });
  return p;
}

export function connect(dbPath: string): DatabaseSync {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  return new DatabaseSync(dbPath);
}

export interface CapturedRecord {
  session_id: string;
  defenses: string[];
  captured_at: number;
}

/**通关记录：哪些场景曾经被解出来过。 */
export class ProgressDB {
  private _path: string;

  constructor(dbPath?: string) {
    this._path = dbPath ?? path.join(RUNTIME_DIR, "progress.db");
    this._ensureSchema();
  }

  private _ensureSchema(): void {
    const db = connect(this._path);
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS captures (
            scenario_id TEXT PRIMARY KEY,
            session_id  TEXT NOT NULL,
            defenses    TEXT NOT NULL DEFAULT '[]',
            captured_at REAL NOT NULL
        )
      `);
    } finally {
      db.close();
    }
  }

  recordCapture(scenarioId: string, sessionId: string, defenses: string[]): void {
    const db = connect(this._path);
    try {
      db.prepare(
        "INSERT OR REPLACE INTO captures (scenario_id, session_id, defenses, captured_at) VALUES (?, ?, ?, ?)",
      ).run(scenarioId, sessionId, JSON.stringify(defenses), Date.now() / 1000);
    } finally {
      db.close();
    }
  }

  captured(): Record<string, CapturedRecord> {
    const db = connect(this._path);
    try {
      const rows = db.prepare("SELECT * FROM captures ORDER BY captured_at").all() as Array<{
        scenario_id: string;
        session_id: string;
        defenses: string;
        captured_at: number;
      }>;
      const out: Record<string, CapturedRecord> = {};
      for (const r of rows) {
        out[r.scenario_id] = {
          session_id: r.session_id,
          defenses: JSON.parse(r.defenses) as string[],
          captured_at: r.captured_at,
        };
      }
      return out;
    } finally {
      db.close();
    }
  }

  clearIds(scenarioIds: string[]): void {
    if (scenarioIds.length === 0) return;
    const db = connect(this._path);
    try {
      const stmt = db.prepare("DELETE FROM captures WHERE scenario_id = ?");
      for (const sid of scenarioIds) stmt.run(sid);
    } finally {
      db.close();
    }
  }

  clearAll(): void {
    const db = connect(this._path);
    try {
      db.exec("DELETE FROM captures");
    } finally {
      db.close();
    }
  }
}

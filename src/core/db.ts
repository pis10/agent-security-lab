/**SQLite：进度库 progress.db，产品世界在 users/<user_id>/worlds/<target_id>/。每次短连接。 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PROJECT_ROOT } from "../lib/config.ts";
import type { ToolContext } from "./tools.ts";

export const RUNTIME_DIR = path.join(PROJECT_ROOT, "data", "runtime");
export const USERS_DIR = path.join(RUNTIME_DIR, "users");

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

/**通关记录：每个账号各自解出过哪些场景。captured_at 是首次通关时间。 */
export class ProgressDB {
  private _path: string;

  constructor(dbPath?: string) {
    this._path = dbPath ?? path.join(RUNTIME_DIR, "progress.db");
    this._ensureSchema();
  }

  private _with<T>(fn: (db: DatabaseSync) => T): T {
    const db = connect(this._path);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  /**db 文件缺失时建表。 */
  private _ensureSchema(): void {
    this._with((db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS captures (
            user_id     INTEGER NOT NULL,
            scenario_id TEXT NOT NULL,
            session_id  TEXT NOT NULL,
            defenses    TEXT NOT NULL DEFAULT '[]',
            captured_at REAL NOT NULL,
            PRIMARY KEY (user_id, scenario_id)
        )
      `),
    );
  }

  /**记录通关。已通关时只更新会话与防护，保留首次通关时间。 */
  recordCapture(userId: number, scenarioId: string, sessionId: string, defenses: string[]): void {
    this._ensureSchema();
    this._with((db) =>
      db
        .prepare(
          `INSERT INTO captures (user_id, scenario_id, session_id, defenses, captured_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (user_id, scenario_id) DO UPDATE SET session_id = excluded.session_id, defenses = excluded.defenses`,
        )
        .run(userId, scenarioId, sessionId, JSON.stringify(defenses), Date.now() / 1000),
    );
  }

  captured(userId: number): Record<string, CapturedRecord> {
    this._ensureSchema();
    const rows = this._with(
      (db) =>
        db.prepare("SELECT * FROM captures WHERE user_id = ? ORDER BY captured_at").all(userId) as Array<{
          scenario_id: string;
          session_id: string;
          defenses: string;
          captured_at: number;
        }>,
    );
    const out: Record<string, CapturedRecord> = {};
    for (const r of rows) {
      out[r.scenario_id] = {
        session_id: r.session_id,
        defenses: JSON.parse(r.defenses) as string[],
        captured_at: r.captured_at,
      };
    }
    return out;
  }

  /**各账号已通关的课程数，账号管理页用。 */
  countsByUser(): Map<number, number> {
    this._ensureSchema();
    const rows = this._with(
      (db) =>
        db.prepare("SELECT user_id, COUNT(*) AS n FROM captures GROUP BY user_id").all() as Array<{
          user_id: number;
          n: number;
        }>,
    );
    return new Map(rows.map((r) => [Number(r.user_id), Number(r.n)]));
  }

  clearIds(userId: number, scenarioIds: string[]): void {
    if (scenarioIds.length === 0) return;
    this._ensureSchema();
    this._with((db) => {
      const stmt = db.prepare("DELETE FROM captures WHERE user_id = ? AND scenario_id = ?");
      for (const sid of scenarioIds) stmt.run(userId, sid);
    });
  }

  clearUser(userId: number): void {
    this._ensureSchema();
    this._with((db) => db.prepare("DELETE FROM captures WHERE user_id = ?").run(userId));
  }
}

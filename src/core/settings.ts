/**站点设置库 settings.db：答案开关、模型配置。模型 Key 存在这里，库文件只给属主读写。 */
import { chmodSync, existsSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { connect, RUNTIME_DIR } from "./db.ts";
import type { LlmSettings } from "./llm.ts";

export interface StoredLlm {
  settings: LlmSettings;
  updated_at: number;
  updated_by: number | null;
}

export class SettingsDB {
  private _path: string;

  constructor(dbPath?: string) {
    this._path = dbPath ?? path.join(RUNTIME_DIR, "settings.db");
    const fresh = !existsSync(this._path);
    this._with((db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key        TEXT PRIMARY KEY,
          value      TEXT NOT NULL,
          updated_at REAL NOT NULL,
          updated_by INTEGER
        )
      `),
    );
    if (fresh) chmodSync(this._path, 0o600);
  }

  private _with<T>(fn: (db: DatabaseSync) => T): T {
    const db = connect(this._path);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  private _get(key: string): { value: string; updated_at: number; updated_by: number | null } | null {
    return this._with((db) => {
      const row = db.prepare("SELECT value, updated_at, updated_by FROM settings WHERE key = ?").get(key);
      if (!row) return null;
      return {
        value: String(row.value),
        updated_at: Number(row.updated_at),
        updated_by: row.updated_by === null ? null : Number(row.updated_by),
      };
    });
  }

  private _set(key: string, value: string, userId: number | null): void {
    this._with((db) =>
      db
        .prepare(
          `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
        )
        .run(key, value, Date.now() / 1000, userId),
    );
  }

  /**默认可看答案；管理员可统一关闭，服务端不再向学员下发答案。 */
  answersVisible(): boolean {
    return this._get("answers_visible")?.value !== "false";
  }

  setAnswersVisible(visible: boolean, userId: number | null = null): void {
    this._set("answers_visible", String(visible), userId);
  }

  llm(): StoredLlm | null {
    const row = this._get("llm");
    if (!row) return null;
    return { settings: JSON.parse(row.value) as LlmSettings, updated_at: row.updated_at, updated_by: row.updated_by };
  }

  setLlm(settings: LlmSettings, userId: number | null): void {
    this._set("llm", JSON.stringify(settings), userId);
  }
}

/**进程内单例；测试与自检可换成临时库。 */
export function getSettingsDb(): SettingsDB {
  const g = globalThis as { __aslSettingsDb?: SettingsDB };
  if (!g.__aslSettingsDb) g.__aslSettingsDb = new SettingsDB();
  return g.__aslSettingsDb;
}

export function setSettingsDb(db: SettingsDB): void {
  (globalThis as { __aslSettingsDb?: SettingsDB }).__aslSettingsDb = db;
}

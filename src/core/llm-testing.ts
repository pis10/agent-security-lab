/**测试用：换成临时设置库并写入一份模型配置，不碰 data/runtime。 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type LlmSettings, resetLlmRuntime } from "./llm.ts";
import { SettingsDB, setSettingsDb } from "./settings.ts";

export const TEST_LLM_DEFAULTS: Omit<LlmSettings, "kind" | "provider" | "model"> = {
  base_url: "",
  api_key: "",
  thinking: "off",
  temperature: 0.3,
  context_window: 128_000,
  max_tokens: 8192,
  compat: {},
  headers: {},
};

/**settings 为 null 时只换空库，模拟管理员还没配置模型。 */
export function installTestLlm(
  settings: (Partial<LlmSettings> & Pick<LlmSettings, "kind" | "provider" | "model">) | null,
): SettingsDB {
  const db = new SettingsDB(path.join(mkdtempSync(path.join(tmpdir(), "asl-settings-")), "settings.db"));
  if (settings) db.setLlm({ ...TEST_LLM_DEFAULTS, ...settings }, null);
  setSettingsDb(db);
  resetLlmRuntime();
  return db;
}

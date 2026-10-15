import type { Scenario } from "../lib/contracts.ts";
import type { ProgressDB } from "./db.ts";

export interface TeachingRow {
  user_id: number;
  username: string;
  display_name: string;
  scenario_id: string;
  title: string;
  tier: string;
  captured_at: number | null;
  tested_at: number | null;
  outcome: "blocked" | "exercised" | "error" | null;
}

export function teachingRows(
  users: { id: number; username: string; display_name: string }[],
  scenarios: Scenario[],
  progress: ProgressDB,
): TeachingRow[] {
  return users.flatMap((user) => {
    const captures = progress.captured(user.id);
    const retests = progress.retests(user.id);
    return scenarios.map((s) => ({
      user_id: user.id,
      username: user.username,
      display_name: user.display_name,
      scenario_id: s.id,
      title: s.title,
      tier: s.tier,
      captured_at: captures[s.id]?.captured_at ?? null,
      tested_at: retests[s.id]?.tested_at ?? null,
      outcome: retests[s.id]?.outcome ?? null,
    }));
  });
}

export const RETEST_LABELS = { blocked: "实际拦截", exercised: "已调用，未见拦截", error: "运行出错" };

/**Excel 公式前缀加单引号，并按 RFC 4180 转义。 */
function csvCell(value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: 防止表格软件跳过控制字符后执行公式
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function teachingCsv(rows: TeachingRow[]): string {
  const date = (ts: number | null) => (ts === null ? "" : new Date(ts * 1000).toISOString());
  return `\uFEFF${[
    ["账号", "姓名", "关卡", "课程", "首次通关时间 (UTC)", "最近复测时间 (UTC)", "复测结果"],
    ...rows.map((r) => [
      r.username,
      r.display_name,
      r.tier,
      r.title,
      date(r.captured_at),
      date(r.tested_at),
      r.outcome ? RETEST_LABELS[r.outcome] : "未复测",
    ]),
  ]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n")}\r\n`;
}

/**答案必须从序列化数据中移除，不能只在浏览器隐藏。管理员带课需要对照答案，不受开关影响。 */
export function scenarioForLearner(
  scenario: Scenario,
  viewer: { answersVisible: boolean; isAdmin: boolean },
): Scenario {
  const { solution, ...rest } = scenario;
  return viewer.answersVisible || viewer.isAdmin ? { ...rest, solution } : rest;
}

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { SCENARIOS } from "../scenarios/index.ts";
import { ProgressDB } from "./db.ts";
import { SettingsDB } from "./settings.ts";
import { scenarioForLearner, teachingCsv, teachingRows } from "./teaching.ts";

test("答案开关持久化；关闭时学员拿到的序列化数据没有 solution，仍保留分级提示，管理员不受影响", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asl-teaching-"));
  try {
    const file = path.join(dir, "settings.db");
    const db = new SettingsDB(file);
    assert.equal(db.answersVisible(), true);
    db.setAnswersVisible(false);
    assert.equal(new SettingsDB(file).answersVisible(), false);
    for (const scenario of SCENARIOS) {
      const redacted = scenarioForLearner(scenario, { answersVisible: db.answersVisible(), isAdmin: false });
      assert.equal(Object.hasOwn(redacted, "solution"), false);
      assert.equal(JSON.stringify(redacted).includes('"solution"'), false);
      assert.equal(redacted.hints.length, 2);
      assert.equal(scenarioForLearner(scenario, { answersVisible: true, isAdmin: false }).solution, scenario.solution);
      // 管理员带课时始终能看到答案
      assert.equal(scenarioForLearner(scenario, { answersVisible: false, isAdmin: true }).solution, scenario.solution);
    }
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("教师数据含每个用户的五关、首次时间与最近复测；CSV 不执行姓名公式", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "asl-teaching-"));
  try {
    const db = new ProgressDB(path.join(dir, "progress.db"));
    db.recordCapture(1, "ticket-idor", "u1:support_bot", []);
    db.recordRetest(1, "ticket-idor", "blocked", ["tenant_acl"]);
    const users = [
      { id: 1, username: "alice", display_name: '\t=HYPERLINK("evil")' },
      { id: 2, username: "bob", display_name: 'Bob,"B"\nSecond line' },
    ];
    const rows = teachingRows(users, SCENARIOS, db);
    assert.equal(rows.length, 10);
    assert.equal(rows[0].outcome, "blocked");
    assert.ok(rows[0].captured_at);
    assert.ok(rows[0].tested_at);
    assert.equal(rows[5].captured_at, null);
    assert.equal(rows[5].tested_at, null);
    const csv = teachingCsv(rows);
    assert.ok(csv.startsWith("\uFEFF"));
    assert.ok(csv.includes('"\'\t=HYPERLINK(""evil"")"'));
    assert.ok(csv.includes('"Bob,""B""\nSecond line"'));
    db.clearIds(2, ["ticket-idor"]);
    assert.ok(db.retests(1)["ticket-idor"]);
    db.clearIds(1, ["ticket-idor"]);
    assert.deepEqual(db.retests(1), {});
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("每关都声明复测工具", () => {
  for (const scenario of SCENARIOS) assert.ok(scenario.retest_tools.length > 0, scenario.id);
});

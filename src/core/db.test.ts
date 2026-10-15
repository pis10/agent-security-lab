import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { ProgressDB } from "./db.ts";

function freshPath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "asl-progress-")), "progress.db");
}

test("通关进度按账号隔离", () => {
  const db = new ProgressDB(freshPath());
  db.recordCapture(1, "ticket-idor", "u1:support_bot", []);
  db.recordCapture(2, "cmd-injection", "u2:devops_assistant", ["cmd_allowlist"]);
  assert.deepEqual(Object.keys(db.captured(1)), ["ticket-idor"]);
  assert.deepEqual(Object.keys(db.captured(2)), ["cmd-injection"]);
  assert.deepEqual(db.captured(2)["cmd-injection"].defenses, ["cmd_allowlist"]);
  assert.deepEqual(db.captured(3), {});
  assert.deepEqual([...db.countsByUser().entries()].sort(), [
    [1, 1],
    [2, 1],
  ]);
});

test("重复观测保留首次通关时间与当时的防护", async () => {
  const db = new ProgressDB(freshPath());
  db.recordCapture(1, "ticket-idor", "u1:support_bot", []);
  const first = db.captured(1)["ticket-idor"].captured_at;
  await new Promise((r) => setTimeout(r, 10));
  db.recordCapture(1, "ticket-idor", "u1:support_bot", ["tenant_acl"]);
  const again = db.captured(1)["ticket-idor"];
  assert.equal(again.captured_at, first);
  assert.deepEqual(again.defenses, []);
});

test("清除只影响指定账号", () => {
  const db = new ProgressDB(freshPath());
  db.recordCapture(1, "ticket-idor", "u1:support_bot", []);
  db.recordCapture(1, "cmd-injection", "u1:devops_assistant", []);
  db.recordCapture(2, "ticket-idor", "u2:support_bot", []);
  db.clearIds(1, ["ticket-idor"]);
  assert.deepEqual(Object.keys(db.captured(1)), ["cmd-injection"]);
  assert.deepEqual(Object.keys(db.captured(2)), ["ticket-idor"]);
  db.clearUser(1);
  assert.deepEqual(db.captured(1), {});
  assert.deepEqual(Object.keys(db.captured(2)), ["ticket-idor"]);
});

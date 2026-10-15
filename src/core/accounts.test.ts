import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AccountsDB,
  generatePassword,
  hashPassword,
  LoginThrottle,
  normalizeUsername,
  SESSION_TTL_SEC,
  verifyPassword,
} from "./accounts.ts";
import { AuthError } from "./errors.ts";

function freshDb(now?: () => number): AccountsDB {
  const dir = mkdtempSync(path.join(tmpdir(), "asl-accounts-"));
  return new AccountsDB({ dbPath: path.join(dir, "accounts.db"), now });
}

test("密码哈希加盐，同一密码两次结果不同且都能校验", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("scrypt$"));
  assert.ok(!a.includes("correct horse"));
  assert.equal(await verifyPassword("correct horse", a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  assert.equal(await verifyPassword("x", "not-a-hash"), false);
});

test("用户名规范化与校验", () => {
  assert.equal(normalizeUsername("  Zhang.San "), "zhang.san");
  assert.throws(() => normalizeUsername("a"), AuthError);
  assert.throws(() => normalizeUsername("-bad"), AuthError);
  assert.throws(() => normalizeUsername("has space"), AuthError);
  assert.match(generatePassword(), /^[a-zA-Z2-9]{12}$/);
});

test("首个管理员：只在空库时创建；未设 ASL_ADMIN_PASSWORD 则随机生成", async () => {
  const db = freshDb();
  const boot = await db.ensureBootstrapAdmin({});
  assert.ok(boot);
  assert.equal(boot.user.username, "admin");
  assert.equal(boot.user.is_admin, true);
  assert.equal(boot.user.must_change_password, true);
  assert.equal(boot.generated, true);
  assert.equal(await db.ensureBootstrapAdmin({}), null);

  const db2 = freshDb();
  const boot2 = await db2.ensureBootstrapAdmin({ ASL_ADMIN_USERNAME: "root", ASL_ADMIN_PASSWORD: "init-pass-123" });
  assert.equal(boot2?.user.username, "root");
  assert.equal(boot2?.generated, false);
  assert.equal((await db2.verifyLogin("root", "init-pass-123")).id, boot2?.user.id);
});

test("管理员建号：返回初始密码，须改密；重名报错", async () => {
  const db = freshDb();
  const { user, initialPassword } = await db.createUser({ username: "Li.Si", displayName: "李四" });
  assert.equal(user.username, "li.si");
  assert.equal(user.display_name, "李四");
  assert.equal(user.must_change_password, true);
  assert.equal(user.is_admin, false);
  assert.equal((await db.verifyLogin("LI.SI", initialPassword)).id, user.id);
  await assert.rejects(db.createUser({ username: "li.si" }), /已存在/);
});

test("登录失败不区分用户不存在与密码错误", async () => {
  const db = freshDb();
  await db.createUser({ username: "wang", password: "password-1" });
  await assert.rejects(db.verifyLogin("wang", "nope"), /用户名或密码错误/);
  await assert.rejects(db.verifyLogin("ghost", "nope"), /用户名或密码错误/);
});

test("改密：校验旧密码与长度，成功后清除须改密标记，旧密码失效", async () => {
  const db = freshDb();
  const { user, initialPassword } = await db.createUser({ username: "zhao" });
  await assert.rejects(db.changePassword(user.id, "wrong", "new-password-1"), /当前密码不正确/);
  await assert.rejects(db.changePassword(user.id, initialPassword, "short"), /至少 8 位/);
  await assert.rejects(db.changePassword(user.id, initialPassword, initialPassword), /不能与当前密码相同/);
  const updated = await db.changePassword(user.id, initialPassword, "new-password-1");
  assert.equal(updated.must_change_password, false);
  await assert.rejects(db.verifyLogin("zhao", initialPassword), /用户名或密码错误/);
  assert.equal((await db.verifyLogin("zhao", "new-password-1")).id, user.id);
});

test("改密注销其它会话，保留当前会话", async () => {
  const db = freshDb();
  const { user, initialPassword } = await db.createUser({ username: "qian" });
  const current = db.createSession(user.id);
  const other = db.createSession(user.id);
  await db.changePassword(user.id, initialPassword, "new-password-1", AccountsDB.tokenHash(current.token));
  assert.equal(db.userForSession(current.token)?.id, user.id);
  assert.equal(db.userForSession(other.token), null);
});

test("会话：按 token 取用户，过期、退出、停用后失效", async () => {
  let now = 1_000_000;
  const db = freshDb(() => now);
  const { user } = await db.createUser({ username: "sun" });
  const s = db.createSession(user.id);
  assert.equal(db.userForSession(s.token)?.id, user.id);
  assert.equal(db.userForSession("forged-token"), null);
  assert.equal(db.userForSession(undefined), null);

  now += SESSION_TTL_SEC + 1;
  assert.equal(db.userForSession(s.token), null);

  const s2 = db.createSession(user.id);
  db.deleteSession(s2.token);
  assert.equal(db.userForSession(s2.token), null);

  const s3 = db.createSession(user.id);
  db.setDisabled(user.id, true);
  assert.equal(db.userForSession(s3.token), null);
  db.setDisabled(user.id, false);
  assert.equal(db.userForSession(s3.token), null, "停用时已删除会话，恢复后需重新登录");
});

test("停用账号无法登录；重置密码生成新初始密码并注销会话", async () => {
  const db = freshDb();
  const { user, initialPassword } = await db.createUser({ username: "zhou" });
  await db.changePassword(user.id, initialPassword, "new-password-1");
  db.setDisabled(user.id, true);
  await assert.rejects(db.verifyLogin("zhou", "new-password-1"), /已停用/);
  db.setDisabled(user.id, false);

  const s = db.createSession(user.id);
  const reset = await db.resetPassword(user.id);
  assert.equal(reset.user.must_change_password, true);
  assert.equal(db.userForSession(s.token), null);
  await assert.rejects(db.verifyLogin("zhou", "new-password-1"), /用户名或密码错误/);
  assert.equal((await db.verifyLogin("zhou", reset.initialPassword)).id, user.id);
});

test("至少保留一个可用管理员", async () => {
  const db = freshDb();
  const boot = await db.ensureBootstrapAdmin({});
  assert.ok(boot);
  assert.throws(() => db.setDisabled(boot.user.id, true), /最后一个管理员/);
  assert.throws(() => db.setAdmin(boot.user.id, false), /至少需要保留一个管理员/);
  const { user: second } = await db.createUser({ username: "admin2", isAdmin: true });
  db.setAdmin(boot.user.id, false);
  assert.equal(db.getUser(boot.user.id).is_admin, false);
  assert.throws(() => db.setDisabled(second.id, true), /最后一个管理员/);
});

test("登录限速：连续失败锁定，锁定期内正确密码也拒绝，期满恢复", async () => {
  let ms = 0;
  const throttle = new LoginThrottle(3, 60_000, 30_000, () => ms);
  const dir = mkdtempSync(path.join(tmpdir(), "asl-accounts-"));
  const db = new AccountsDB({ dbPath: path.join(dir, "accounts.db"), throttle });
  await db.createUser({ username: "wu", password: "password-1" });
  for (let i = 0; i < 3; i++) await assert.rejects(db.verifyLogin("wu", "bad"));
  await assert.rejects(db.verifyLogin("wu", "password-1"), /失败次数过多/);
  ms += 30_001;
  assert.equal((await db.verifyLogin("wu", "password-1")).username, "wu");
});

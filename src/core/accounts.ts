/**账号库 accounts.db：用户、密码哈希、登录会话。只由管理员建号；初始密码首次登录后必须修改。
 *
 * 密码：scrypt + 每用户随机盐。会话：随机 token 只放 cookie，库里存其 SHA-256。
 */
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { MIN_PASSWORD_LENGTH } from "../lib/contracts.ts";
import { connect, RUNTIME_DIR } from "./db.ts";
import { AuthError, NotFoundError } from "./errors.ts";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number, opts: object) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };
export const SESSION_TTL_SEC = 7 * 24 * 3600;
export { MIN_PASSWORD_LENGTH };

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,31}$/;
/**初始密码字符集：去掉 0/O/1/l/I 等易混字符。 */
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface User {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  disabled: boolean;
  must_change_password: boolean;
  created_at: number;
  last_login_at: number | null;
}

interface UserRow {
  id: number;
  username: string;
  display_name: string;
  password_hash: string;
  is_admin: number;
  disabled: number;
  must_change_password: number;
  created_at: number;
  last_login_at: number | null;
}

function toUser(r: UserRow): User {
  return {
    id: r.id,
    username: r.username,
    display_name: r.display_name,
    is_admin: r.is_admin === 1,
    disabled: r.disabled === 1,
    must_change_password: r.must_change_password === 1,
    created_at: r.created_at,
    last_login_at: r.last_login_at,
  };
}

export function normalizeUsername(raw: string): string {
  const username = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) {
    throw new AuthError("用户名须为 2–32 位小写字母、数字或 . _ -，且以字母或数字开头");
  }
  return username;
}

export function generatePassword(length = 12): string {
  let out = "";
  for (let i = 0; i < length; i++) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)];
  return out;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT;
  const hash = await scrypt(password, salt, keylen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const got = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return got.length === expected.length && timingSafeEqual(got, expected);
}

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function checkNewPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`);
  }
  if (password.length > 128) {
    throw new AuthError("新密码不能超过 128 位");
  }
}

/**登录失败限速：同一用户名在窗口内失败过多则暂时锁定。只在内存里，重启清零。 */
export class LoginThrottle {
  private _fails = new Map<string, number[]>();
  private _lockedUntil = new Map<string, number>();
  private readonly maxFails: number;
  private readonly windowMs: number;
  private readonly lockMs: number;
  private readonly now: () => number;

  constructor(maxFails = 5, windowMs = 10 * 60_000, lockMs = 5 * 60_000, now: () => number = Date.now) {
    this.maxFails = maxFails;
    this.windowMs = windowMs;
    this.lockMs = lockMs;
    this.now = now;
  }

  /**仍在锁定期时返回剩余秒数，否则 0。 */
  lockedFor(key: string): number {
    const until = this._lockedUntil.get(key) ?? 0;
    const left = until - this.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  fail(key: string): void {
    const t = this.now();
    const recent = (this._fails.get(key) ?? []).filter((x) => t - x < this.windowMs);
    recent.push(t);
    this._fails.set(key, recent);
    if (recent.length >= this.maxFails) {
      this._lockedUntil.set(key, t + this.lockMs);
      this._fails.delete(key);
    }
  }

  succeed(key: string): void {
    this._fails.delete(key);
    this._lockedUntil.delete(key);
  }
}

export interface AccountsOptions {
  dbPath?: string;
  /**秒级时间，测试注入。 */
  now?: () => number;
  throttle?: LoginThrottle;
}

export class AccountsDB {
  private _path: string;
  private _now: () => number;
  readonly throttle: LoginThrottle;

  constructor(opts: AccountsOptions = {}) {
    this._path = opts.dbPath ?? path.join(RUNTIME_DIR, "accounts.db");
    this._now = opts.now ?? (() => Date.now() / 1000);
    this.throttle = opts.throttle ?? new LoginThrottle();
    this._with((db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            username             TEXT NOT NULL UNIQUE,
            display_name         TEXT NOT NULL,
            password_hash        TEXT NOT NULL,
            is_admin             INTEGER NOT NULL DEFAULT 0,
            disabled             INTEGER NOT NULL DEFAULT 0,
            must_change_password INTEGER NOT NULL DEFAULT 1,
            created_at           REAL NOT NULL,
            last_login_at        REAL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at REAL NOT NULL,
            expires_at REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      `);
    });
  }

  private _with<T>(fn: (db: DatabaseSync) => T): T {
    const db = connect(this._path);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  }

  private _row(where: string, value: string | number): UserRow | undefined {
    return this._with(
      (db) => db.prepare(`SELECT * FROM users WHERE ${where} = ?`).get(value) as unknown as UserRow | undefined,
    );
  }

  countUsers(): number {
    return this._with((db) => Number((db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n));
  }

  listUsers(): User[] {
    return this._with((db) =>
      (db.prepare("SELECT * FROM users ORDER BY id").all() as unknown as UserRow[]).map(toUser),
    );
  }

  getUser(userId: number): User {
    const row = this._row("id", userId);
    if (!row) throw new NotFoundError(`账号 ${userId} 不存在`);
    return toUser(row);
  }

  /**管理员建号：返回一次性展示的初始密码（不传则随机生成），首次登录须修改。 */
  async createUser(input: {
    username: string;
    displayName?: string;
    isAdmin?: boolean;
    password?: string;
  }): Promise<{ user: User; initialPassword: string }> {
    const username = normalizeUsername(input.username);
    const displayName = (input.displayName ?? "").trim() || username;
    if (displayName.length > 32) throw new AuthError("显示名不能超过 32 个字符");
    if (this._row("username", username)) throw new AuthError(`用户名 ${username} 已存在`);
    const initialPassword = input.password ?? generatePassword();
    checkNewPassword(initialPassword);
    const hash = await hashPassword(initialPassword);
    const id = this._with((db) =>
      Number(
        db
          .prepare(
            "INSERT INTO users (username, display_name, password_hash, is_admin, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, ?)",
          )
          .run(username, displayName, hash, input.isAdmin ? 1 : 0, this._now()).lastInsertRowid,
      ),
    );
    return { user: this.getUser(id), initialPassword };
  }

  /**库里还没有账号时建首个管理员；密码取自 ASL_ADMIN_PASSWORD，未设置则随机生成。已有账号时返回 null。 */
  async ensureBootstrapAdmin(env: Record<string, string | undefined> = process.env): Promise<{
    user: User;
    initialPassword: string;
    generated: boolean;
  } | null> {
    if (this.countUsers() > 0) return null;
    const fromEnv = env.ASL_ADMIN_PASSWORD?.trim() || "";
    const { user, initialPassword } = await this.createUser({
      username: env.ASL_ADMIN_USERNAME?.trim() || "admin",
      displayName: "管理员",
      isAdmin: true,
      password: fromEnv || undefined,
    });
    return { user, initialPassword, generated: fromEnv === "" };
  }

  /**校验用户名与密码。错误信息不区分“用户不存在”和“密码错误”。 */
  async verifyLogin(rawUsername: string, password: string): Promise<User> {
    const key = rawUsername.trim().toLowerCase();
    const locked = this.throttle.lockedFor(key);
    if (locked > 0) throw new AuthError(`登录失败次数过多，请 ${locked} 秒后再试`);
    const row = this._row("username", key);
    let ok = false;
    if (row) {
      ok = await verifyPassword(password, row.password_hash);
    } else {
      // 用户不存在时也跑一次哈希，避免按耗时区分
      await hashPassword(password);
    }
    if (!row || !ok) {
      this.throttle.fail(key);
      throw new AuthError("用户名或密码错误");
    }
    if (row.disabled === 1) throw new AuthError("账号已停用，请联系管理员");
    this.throttle.succeed(key);
    this._with((db) => db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(this._now(), row.id));
    return this.getUser(row.id);
  }

  /**本人改密码：校验旧密码，清除“须改初始密码”标记，并注销其它会话。 */
  async changePassword(userId: number, current: string, next: string, keepTokenHash?: string): Promise<User> {
    const row = this._row("id", userId);
    if (!row) throw new NotFoundError(`账号 ${userId} 不存在`);
    if (!(await verifyPassword(current, row.password_hash))) throw new AuthError("当前密码不正确");
    checkNewPassword(next);
    if (next === current) throw new AuthError("新密码不能与当前密码相同");
    const hash = await hashPassword(next);
    this._with((db) => {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hash, userId);
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(userId, keepTokenHash ?? "");
    });
    return this.getUser(userId);
  }

  /**管理员重置密码：生成新的初始密码，须重新修改，并注销该账号全部会话。 */
  async resetPassword(userId: number): Promise<{ user: User; initialPassword: string }> {
    this.getUser(userId);
    const initialPassword = generatePassword();
    const hash = await hashPassword(initialPassword);
    this._with((db) => {
      db.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(hash, userId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    });
    this.throttle.succeed(this.getUser(userId).username);
    return { user: this.getUser(userId), initialPassword };
  }

  private _activeAdminCount(): number {
    return this._with((db) =>
      Number(
        (db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND disabled = 0").get() as { n: number }).n,
      ),
    );
  }

  /**停用会注销该账号全部会话。不能停用最后一个可用的管理员。 */
  setDisabled(userId: number, disabled: boolean): User {
    const user = this.getUser(userId);
    if (disabled && user.is_admin && !user.disabled && this._activeAdminCount() <= 1) {
      throw new AuthError("不能停用最后一个管理员");
    }
    this._with((db) => {
      db.prepare("UPDATE users SET disabled = ? WHERE id = ?").run(disabled ? 1 : 0, userId);
      if (disabled) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    });
    return this.getUser(userId);
  }

  /**不能撤销最后一个可用管理员的管理员身份。 */
  setAdmin(userId: number, isAdmin: boolean): User {
    const user = this.getUser(userId);
    if (!isAdmin && user.is_admin && !user.disabled && this._activeAdminCount() <= 1) {
      throw new AuthError("至少需要保留一个管理员");
    }
    this._with((db) => db.prepare("UPDATE users SET is_admin = ? WHERE id = ?").run(isAdmin ? 1 : 0, userId));
    return this.getUser(userId);
  }

  /**新建会话，返回只给浏览器的 token。 */
  createSession(userId: number): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString("base64url");
    const now = this._now();
    const expiresAt = now + SESSION_TTL_SEC;
    this._with((db) => {
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
      db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
        sha256(token),
        userId,
        now,
        expiresAt,
      );
    });
    return { token, expiresAt };
  }

  /**按 token 找当前用户；过期、已删除或已停用都返回 null。 */
  userForSession(token: string | undefined | null): User | null {
    if (!token) return null;
    const row = this._with(
      (db) =>
        db
          .prepare(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
          )
          .get(sha256(token), this._now()) as unknown as UserRow | undefined,
    );
    if (!row || row.disabled === 1) return null;
    return toUser(row);
  }

  deleteSession(token: string | undefined | null): void {
    if (!token) return;
    this._with((db) => db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token)));
  }

  static tokenHash(token: string): string {
    return sha256(token);
  }
}

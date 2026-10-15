/**登录态：会话 cookie 读写、API 与页面的登录 / 管理员校验、首个管理员初始化。 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AccountsDB, SESSION_TTL_SEC, type User } from "../core/accounts.ts";
import { ForbiddenError, PasswordChangeRequiredError, UnauthorizedError } from "../core/errors.ts";
import { type PublicUser, SESSION_COOKIE } from "./contracts.ts";

export type { PublicUser };
export { SESSION_COOKIE };

export function publicUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    is_admin: u.is_admin,
    must_change_password: u.must_change_password,
  };
}

export function getAccountsDb(): AccountsDB {
  const g = globalThis as { __aslAccounts?: AccountsDB };
  if (!g.__aslAccounts) g.__aslAccounts = new AccountsDB();
  return g.__aslAccounts;
}

/**空库时建首个管理员。随机生成的初始密码只在服务日志里出现这一次。 */
export async function ensureAccountsReady(): Promise<AccountsDB> {
  const db = getAccountsDb();
  const g = globalThis as { __aslBootstrap?: Promise<void> };
  if (!g.__aslBootstrap) {
    g.__aslBootstrap = db.ensureBootstrapAdmin().then((boot) => {
      if (boot?.generated) {
        console.info(
          `[asl] 已创建初始管理员 ${boot.user.username}，初始密码：${boot.initialPassword}（首次登录后须修改）`,
        );
      } else if (boot) {
        console.info(`[asl] 已按 ASL_ADMIN_PASSWORD 创建初始管理员 ${boot.user.username}（首次登录后须修改）`);
      }
    });
  }
  await g.__aslBootstrap;
  return db;
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/**先读 cookie 再碰库：构建期预渲染在读 cookie 处就转为动态渲染，不会提前建库、初始化管理员。 */
export async function currentUser(): Promise<User | null> {
  const token = await sessionToken();
  if (!token) return null;
  const db = await ensureAccountsReady();
  return db.userForSession(token);
}

/**API 用：未登录 401；还没改初始密码时 403（改密与查询本人接口放行）。 */
export async function requireUser(opts: { allowMustChange?: boolean } = {}): Promise<User> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError("请先登录");
  if (user.must_change_password && !opts.allowMustChange) throw new PasswordChangeRequiredError("请先修改初始密码");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.is_admin) throw new ForbiddenError("需要管理员权限");
  return user;
}

/**只接受站内相对路径，防止登录后被带去外站。 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw?.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

/**页面用：未登录跳登录页（登录后回到原页），还没改初始密码跳改密页。 */
export async function requirePageUser(returnTo = "/"): Promise<User> {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeNextPath(returnTo))}`);
  if (user.must_change_password) redirect("/account/password");
  return user;
}

export async function requirePageAdmin(returnTo = "/admin"): Promise<User> {
  const user = await requirePageUser(returnTo);
  if (!user.is_admin) redirect("/");
  return user;
}

function isHttps(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}

export async function setSessionCookie(token: string, req: Request): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
    secure: isHttps(req),
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/**写请求带 Origin 时必须与本站同源，挡住跨站提交。 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    /* 非法 Origin 按跨站处理 */
  }
  if (!host || originHost !== host) throw new ForbiddenError("跨站请求被拒绝");
}

/**改密时保留当前会话：返回当前 cookie 对应的 token 哈希。 */
export async function currentTokenHash(): Promise<string | undefined> {
  const token = await sessionToken();
  return token ? AccountsDB.tokenHash(token) : undefined;
}

/**管理后台看到的账号字段（不含密码哈希）。 */
export function adminUserView(u: User) {
  return {
    ...publicUser(u),
    disabled: u.disabled,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
  };
}

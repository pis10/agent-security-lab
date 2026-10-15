/**未登录的请求：页面跳登录页（登录后回到原页），接口返回 401。只看会话 cookie 在不在，校验在各页面与接口里。
 *
 * 仿真产品的站内服务（外发箱、假内网、拨测站点、IdP、Insights）由工具在服务端调用，不经过登录。
 */
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./lib/contracts.ts";

const PUBLIC_PATHS = new Set(["/login", "/api/auth/login"]);

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || req.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ detail: "请先登录" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sink/|internal/|sites/|idp/|insights-warehouse/).*)"],
};

/**仿真服务的进程内凭据。只保存在内存，不进入工具参数、轨迹、环境变量或响应。 */
import { randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_HEADER = "X-ASL-Internal-Token";
// Next 的不同路由 bundle / 开发热更新必须共用同一个凭据。当前应用以单进程运行。
const runtime = globalThis as typeof globalThis & { __aslInternalToken?: string };
runtime.__aslInternalToken ??= randomBytes(32).toString("hex");
const token = runtime.__aslInternalToken;

/**所有仿真路由在读取请求体或产生副作用前调用；浏览器登录态不能替代内部凭据。 */
export function denyExternalRequest(req: Request): Response | null {
  const supplied = Buffer.from(req.headers.get(TOKEN_HEADER) ?? "");
  const expected = Buffer.from(token);
  if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) return null;
  return Response.json({ detail: "仅允许靶场内部调用" }, { status: 403 });
}

/**只接受配置指定的 loopback origin；端口、协议和用户信息也属于边界。 */
export function isLocalServiceUrl(url: URL, baseUrl: string): boolean {
  const base = new URL(baseUrl);
  return (
    base.protocol === "http:" &&
    base.hostname === "127.0.0.1" &&
    url.origin === base.origin &&
    url.username === "" &&
    url.password === ""
  );
}

/**自动附内部凭据，但绝不自动跟随跳转；需要跳转的工具须逐跳重新校验。 */
export function fetchInternal(url: string | URL, baseUrl: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url, baseUrl);
  if (!isLocalServiceUrl(target, baseUrl)) throw new Error("仿真服务请求超出本站范围");
  const headers = new Headers(init.headers);
  headers.set(TOKEN_HEADER, token);
  return fetch(target, {
    ...init,
    headers,
    redirect: "manual",
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(5000),
  });
}

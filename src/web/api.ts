/**Route Handlers 共享助手：错误映射（对齐旧版 404/400 语义）与 zod 请求体解析。 */
import type { z } from "zod";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (msg: string) => new ApiError(404, msg);
export const badRequest = (msg: string) => new ApiError(400, msg);

export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (exc) {
    if (exc instanceof ApiError) {
      return Response.json({ detail: exc.message }, { status: exc.status });
    }
    const msg = exc instanceof Error ? exc.message : String(exc);
    // 与旧版对齐：unknown target/scenario → 404（KeyError 语义）；
    // 业务校验/状态类错误（ValueError、RuntimeError 语义）→ 400。
    if (msg.startsWith("unknown target") || msg.startsWith("unknown scenario")) {
      return Response.json({ detail: msg }, { status: 404 });
    }
    if (msg.startsWith("MCP server") || msg.includes("timed out")) {
      console.error("[route] unexpected error:", exc);
    }
    return Response.json({ detail: msg }, { status: 400 });
  }
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw badRequest(`请求体不合法: ${issues}`);
  }
  return parsed.data;
}

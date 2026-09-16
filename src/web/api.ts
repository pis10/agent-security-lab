/**Route Handlers 共享助手：领域错误 → HTTP 状态映射 + zod 请求体解析。 */

import type { z } from "zod";
import { BadRequestError, NotFoundError } from "../core/errors.ts";

export const notFound = (msg: string) => new NotFoundError(msg);
export const badRequest = (msg: string) => new BadRequestError(msg);

export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (exc) {
    if (exc instanceof NotFoundError) {
      return Response.json({ detail: exc.message }, { status: 404 });
    }
    if (exc instanceof BadRequestError) {
      return Response.json({ detail: exc.message }, { status: 400 });
    }
    // 未分类异常是服务端故障：如实记 500，不吞进 400 冒充客户端错误
    console.error("[route] unexpected error:", exc);
    const msg = exc instanceof Error ? exc.message : String(exc);
    return Response.json({ detail: msg }, { status: 500 });
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

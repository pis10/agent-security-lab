/**Route Handlers 共享助手：领域错误 → HTTP 状态映射 + zod 请求体解析。 */

import type { z } from "zod";
import { BadRequestError, httpErrorOf } from "../core/errors.ts";

export const badRequest = (msg: string) => new BadRequestError(msg);

export async function handleRoute(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    const known = httpErrorOf(err);
    if (known) return Response.json(known.body, { status: known.status });
    console.error("[route] unexpected error:", err);
    const msg = err instanceof Error ? err.message : String(err);
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

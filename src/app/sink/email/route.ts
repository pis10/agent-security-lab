import { SINKS } from "@/core/sinks.ts";

export const dynamic = "force-dynamic";

function sessionOf(req: Request): string {
  return req.headers.get("X-ASL-Session") ?? "global";
}

/**外发箱端点：请求体原样写入。 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  SINKS.add(sessionOf(req), "email", body);
  return Response.json({ ok: true, note: "外发箱已收下（未真实发送）" });
}

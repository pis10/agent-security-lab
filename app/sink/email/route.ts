import { SINKS } from "../../../src/core/sinks.ts";

export const dynamic = "force-dynamic";

function sessionOf(req: Request): string {
  return req.headers.get("X-ASL-Session") ?? "global";
}

/**攻击面端点：载荷是外发数据，必须原样进外发箱——不做任何 schema 校验。 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  SINKS.add(sessionOf(req), "email", body);
  return Response.json({ ok: true, note: "外发箱已收下（未真实发送）" });
}

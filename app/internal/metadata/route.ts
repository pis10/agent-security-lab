import { SINKS } from "../../../src/core/sinks.ts";

export const dynamic = "force-dynamic";

function sessionOf(req: Request): string {
  return req.headers.get("X-ASL-Session") ?? "global";
}

export async function GET(req: Request) {
  const payload = {
    endpoint: "/internal/metadata",
    instance: "ops-test",
    iam_token: "ASIAIOSFODNN7EXAMPLE",
  };
  SINKS.add(sessionOf(req), "internal", payload);
  return Response.json(payload);
}

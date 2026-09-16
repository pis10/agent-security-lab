import { SINKS } from "@/core/sinks.ts";

export const dynamic = "force-dynamic";

function sessionOf(req: Request): string {
  return req.headers.get("X-ASL-Session") ?? "global";
}

export async function GET(req: Request) {
  SINKS.add(sessionOf(req), "internal", { endpoint: "/internal/records" });
  return Response.json({
    rows: [
      { id: 1, name: "dummy-user", ssn: "TEST_SSN_000-00-0000" },
      { id: 2, name: "dummy-admin", api_key: "PRD-RECORD-9F3K" },
    ],
  });
}

import { SINKS } from "@/core/sinks.ts";

export const dynamic = "force-dynamic";

function sessionOf(req: Request): string {
  return req.headers.get("X-ASL-Session") ?? "global";
}

export async function GET(req: Request) {
  const payload = {
    endpoint: "/internal/metadata",
    instance: "ops-test",
    ram: {
      Role: "ops-inspect-role",
      AccessKeyId: "STS.N4aBExample4CloudOps",
      AccessKeySecret: "ExampleAccessKeySecret4LabOnly",
      SecurityToken: "ExampleSecurityToken4LabUseOnly",
      Expiration: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
      Code: "Success",
    },
  };
  SINKS.add(sessionOf(req), "internal", payload);
  return Response.json(payload);
}

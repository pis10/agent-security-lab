import { jwks } from "@/lib/idp.ts";

export const dynamic = "force-dynamic";

/**企业 IdP 的 JWKS 端点（仿真托管在本源）。 */
export function GET() {
  return Response.json(jwks());
}

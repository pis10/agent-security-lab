import { denyExternalRequest } from "../../../core/internal-http.ts";
import { jwks } from "../../../lib/idp.ts";

export const dynamic = "force-dynamic";

/**企业 IdP 的 JWKS 端点（仿真托管在本源）。 */
export function GET(req: Request) {
  const denied = denyExternalRequest(req);
  if (denied) return denied;
  return Response.json(jwks());
}

import { denyExternalRequest } from "../../../../core/internal-http.ts";
/**job-runner 状态端点：总览「服务健康拨测」登记的巡检目标之一。 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = denyExternalRequest(req);
  if (denied) return denied;
  return Response.json({
    service: "job-runner",
    status: "ok",
    queued: 1,
    running: "nightly-sync",
    checked_at: new Date().toISOString(),
  });
}

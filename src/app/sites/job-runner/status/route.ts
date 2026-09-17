/**job-runner 状态端点：总览「服务健康拨测」登记的巡检目标之一。 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    service: "job-runner",
    status: "ok",
    queued: 1,
    running: "nightly-sync",
    checked_at: new Date().toISOString(),
  });
}

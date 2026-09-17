/**edge-gateway 健康端点：总览「服务健康拨测」登记的巡检目标之一。 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    service: "edge-gateway",
    status: "ok",
    version: "2.7.1",
    upstreams: 4,
    checked_at: new Date().toISOString(),
  });
}

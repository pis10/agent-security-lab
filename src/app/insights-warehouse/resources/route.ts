import { denyExternalRequest } from "../../../core/internal-http.ts";
import { readResource } from "../../../targets/insights.ts";

export const dynamic = "force-dynamic";

/**Insights Warehouse 资源读取端点（Remote MCP 仿真）。 */
export async function POST(req: Request) {
  const denied = denyExternalRequest(req);
  if (denied) return denied;
  return readResource(req);
}

import { listTargets, toTargetInfo } from "@/targets/registry.ts";
import { handleRoute } from "@/lib/http.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => Response.json(listTargets().map(toTargetInfo)));
}

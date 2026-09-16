import { listTargets } from "../../../src/targets/registry.ts";
import { handleRoute } from "../../../src/web/api.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () =>
    Response.json(
      listTargets().map((t) => ({
        id: t.id,
        name: t.name,
        tier_focus: t.tierFocus,
        description: t.description,
        defenses: t.defenses,
      })),
    ),
  );
}

import { handleRoute } from "../../../src/web/api.ts";
import { getWorldManager } from "../../../src/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () =>
    Response.json(
      getWorldManager()
        .list()
        .map(({ messages: _messages, ...rest }) => rest),
    ),
  );
}

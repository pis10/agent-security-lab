import { handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

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

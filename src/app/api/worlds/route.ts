import { requireUser } from "@/lib/auth.ts";
import { handleRoute } from "@/lib/http.ts";
import { getWorldManager } from "@/world/manager.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    return Response.json(
      getWorldManager()
        .list(user.id)
        .map(({ messages: _messages, ...rest }) => rest),
    );
  });
}

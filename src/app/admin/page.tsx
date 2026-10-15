import { requirePageAdmin } from "@/lib/auth.ts";
import { catalogData } from "@/lib/page-data.ts";
import { AdminUsers } from "@/ui/AdminUsers";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 账号管理" };

export default async function Page() {
  const user = await requirePageAdmin("/admin");
  const { meta, progress, scenarios } = catalogData(user.id);
  return <AdminUsers meta={meta} progress={progress} scenarioCount={scenarios.length} selfId={user.id} />;
}

import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth.ts";
import { catalogData, worldSummaries } from "@/lib/page-data.ts";
import { ObserveBoard } from "@/ui/ObserveBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 观测" };

export default async function Page() {
  const user = await requirePageUser("/observe");
  const worlds = worldSummaries(user.id);
  if (worlds.length === 1) {
    redirect(`/observe/${worlds[0].target_id}`);
  }
  const { meta, progress, scenarios } = catalogData(user.id);
  return <ObserveBoard worlds={worlds} meta={meta} progress={progress} scenarioCount={scenarios.length} />;
}

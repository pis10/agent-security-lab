import { redirect } from "next/navigation";
import { catalogData, worldSummaries } from "@/lib/page-data.ts";
import { ObserveBoard } from "@/ui/ObserveBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 观测" };

export default function Page() {
  const worlds = worldSummaries();
  if (worlds.length === 1) {
    redirect(`/observe/${worlds[0].target_id}`);
  }
  const { meta, progress, scenarios } = catalogData();
  return <ObserveBoard worlds={worlds} meta={meta} progress={progress} scenarioCount={scenarios.length} />;
}

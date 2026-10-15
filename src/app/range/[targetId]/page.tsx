import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth.ts";
import { learnerScenario, llmMeta } from "@/lib/page-data.ts";
import { getScenario, SCENARIOS } from "@/scenarios/index.ts";
import { findTarget } from "@/targets/registry.ts";
import { productOf } from "@/ui/catalog.ts";
import { Workspace } from "@/ui/Workspace";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ targetId: string }>;
  searchParams: Promise<{ mission?: string | string[] }>;
};

export async function generateMetadata({ params }: Props) {
  const { targetId } = await params;
  return { title: `${productOf(targetId).brand} · ASL` };
}

export default async function Page({ params, searchParams }: Props) {
  const { targetId } = await params;
  const sp = await searchParams;
  const missionId = typeof sp.mission === "string" ? sp.mission : "";
  const user = await requirePageUser(
    `/range/${targetId}${missionId ? `?mission=${encodeURIComponent(missionId)}` : ""}`,
  );
  if (!findTarget(targetId)) notFound();
  const scenario = missionId ? getScenario(missionId) : null;
  if (missionId && (!scenario || scenario.target !== targetId)) notFound();
  return (
    <Workspace
      missions={SCENARIOS.filter((s) => s.target === targetId).map((s) => learnerScenario(s, user))}
      targetId={targetId}
      missionId={missionId}
      scenario={scenario && scenario.target === targetId ? learnerScenario(scenario, user) : null}
      meta={llmMeta()}
    />
  );
}

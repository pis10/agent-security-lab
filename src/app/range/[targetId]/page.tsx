import { notFound } from "next/navigation";
import { llmMeta } from "@/lib/page-data.ts";
import { getScenario } from "@/scenarios/index.ts";
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
  if (!findTarget(targetId)) notFound();
  const sp = await searchParams;
  const missionId = typeof sp.mission === "string" ? sp.mission : "";
  const scenario = missionId ? getScenario(missionId) : null;
  return (
    <Workspace
      targetId={targetId}
      missionId={missionId}
      scenario={scenario && scenario.target === targetId ? scenario : null}
      meta={llmMeta()}
    />
  );
}

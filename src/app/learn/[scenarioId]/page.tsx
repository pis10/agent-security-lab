import { notFound } from "next/navigation";
import { catalogData } from "@/lib/page-data.ts";
import { getScenario } from "@/scenarios/index.ts";
import { findTarget, toTargetInfo } from "@/targets/registry.ts";
import { Lesson } from "@/ui/Lesson";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ scenarioId: string }> };

export async function generateMetadata({ params }: Props) {
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  return { title: scenario ? `ASL · ${scenario.title}` : "ASL · 教学" };
}

export default async function Page({ params }: Props) {
  const { scenarioId } = await params;
  const scenario = getScenario(scenarioId);
  if (!scenario) notFound();
  const target = findTarget(scenario.target);
  if (!target) notFound();
  const { progress, meta, scenarios } = catalogData();
  return (
    <Lesson
      scenario={scenario}
      target={toTargetInfo(target)}
      progress={progress}
      meta={meta}
      scenarioCount={scenarios.length}
    />
  );
}

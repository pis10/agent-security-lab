import { notFound } from "next/navigation";
import { catalogData } from "@/lib/page-data.ts";
import { findTarget, toTargetInfo } from "@/targets/registry.ts";
import { productOf } from "@/ui/catalog.ts";
import { ObserveStudio } from "@/ui/ObserveStudio";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ targetId: string }> };

export async function generateMetadata({ params }: Props) {
  const { targetId } = await params;
  return { title: `观测 · ${productOf(targetId).brand} · ASL` };
}

export default async function Page({ params }: Props) {
  const { targetId } = await params;
  const target = findTarget(targetId);
  if (!target) notFound();
  const { meta, progress, scenarios } = catalogData();
  return (
    <ObserveStudio
      targetId={targetId}
      target={toTargetInfo(target)}
      meta={meta}
      progress={progress}
      scenarioCount={scenarios.length}
    />
  );
}

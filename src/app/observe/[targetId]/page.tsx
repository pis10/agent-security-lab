import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth.ts";
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
  const user = await requirePageUser(`/observe/${targetId}`);
  const target = findTarget(targetId);
  if (!target) notFound();
  const { meta, progress, scenarios, targets } = catalogData(user);
  return (
    <ObserveStudio
      target={toTargetInfo(target)}
      targets={targets}
      scenarios={scenarios}
      meta={meta}
      progress={progress}
    />
  );
}

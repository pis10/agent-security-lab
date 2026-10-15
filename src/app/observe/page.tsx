import { requirePageUser } from "@/lib/auth.ts";
import { catalogData, worldSummaries } from "@/lib/page-data.ts";
import { ObserveBoard } from "@/ui/ObserveBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 观测" };

export default async function Page() {
  const user = await requirePageUser("/observe");
  const { meta, progress, scenarios, targets } = catalogData(user);
  return (
    <ObserveBoard
      worlds={worldSummaries(user.id)}
      targets={targets}
      scenarios={scenarios}
      meta={meta}
      progress={progress}
    />
  );
}

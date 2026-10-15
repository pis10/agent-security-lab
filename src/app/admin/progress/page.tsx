import { getSettingsDb } from "@/core/settings.ts";
import { teachingRows } from "@/core/teaching.ts";
import { ensureAccountsReady, requirePageAdmin } from "@/lib/auth.ts";
import { catalogData } from "@/lib/page-data.ts";
import { SCENARIOS } from "@/scenarios/index.ts";
import { TeachingProgress } from "@/ui/TeachingProgress";
import { getProgressDb } from "@/world/manager.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "ASL · 教学进度" };

export default async function Page() {
  const user = await requirePageAdmin("/admin/progress");
  const db = getProgressDb();
  const users = (await ensureAccountsReady()).listUsers();
  const { meta, progress } = catalogData(user);
  return (
    <TeachingProgress
      initialRows={teachingRows(users, SCENARIOS, db)}
      answersVisible={getSettingsDb().answersVisible()}
      meta={meta}
      progress={progress}
      scenarioCount={SCENARIOS.length}
    />
  );
}

import { requirePageUser } from "@/lib/auth.ts";
import { catalogData } from "@/lib/page-data.ts";
import { Academy } from "@/ui/Academy";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 教学" };

export default async function Page() {
  const user = await requirePageUser("/learn");
  const { scenarios, progress, meta } = catalogData(user.id);
  return <Academy scenarios={scenarios} progress={progress} meta={meta} />;
}

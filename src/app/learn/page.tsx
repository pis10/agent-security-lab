import { catalogData } from "@/lib/page-data.ts";
import { Academy } from "@/ui/Academy";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 教学" };

export default function Page() {
  const { scenarios, progress, meta } = catalogData();
  return <Academy scenarios={scenarios} progress={progress} meta={meta} />;
}

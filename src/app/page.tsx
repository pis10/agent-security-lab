import { catalogData } from "@/lib/page-data.ts";
import { RangeBoard } from "@/ui/RangeBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 靶场" };

export default function Page() {
  return <RangeBoard {...catalogData()} />;
}

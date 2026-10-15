import { requirePageUser } from "@/lib/auth.ts";
import { catalogData } from "@/lib/page-data.ts";
import { RangeBoard } from "@/ui/RangeBoard";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 靶场" };

export default async function Page() {
  const user = await requirePageUser("/");
  return <RangeBoard {...catalogData(user)} />;
}

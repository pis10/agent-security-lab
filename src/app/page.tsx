import { requirePageUser } from "@/lib/auth.ts";
import { catalogData } from "@/lib/page-data.ts";
import { Home } from "@/ui/Home";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 学习" };

export default async function Page() {
  const user = await requirePageUser("/");
  return <Home {...catalogData(user)} />;
}

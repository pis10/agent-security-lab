import { redirect } from "next/navigation";
import { currentUser, publicUser } from "@/lib/auth.ts";
import { PasswordForm } from "@/ui/Auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 修改密码" };

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/account/password")}`);
  return <PasswordForm user={publicUser(user)} />;
}

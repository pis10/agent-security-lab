import { redirect } from "next/navigation";
import { currentUser, ensureAccountsReady, safeNextPath } from "@/lib/auth.ts";
import { LoginForm } from "@/ui/Auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "ASL · 登录" };

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : null);
  const user = await currentUser();
  if (user) redirect(user.must_change_password ? "/account/password" : next);
  // 刚部署、管理员还没登录过：提示初始密码在哪
  const users = (await ensureAccountsReady()).listUsers();
  const firstRunAdmin = users.length === 1 && users[0].last_login_at === null ? users[0].username : null;
  return <LoginForm next={next} firstRunAdmin={firstRunAdmin} />;
}

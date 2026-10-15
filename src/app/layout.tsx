import type { Metadata } from "next";
import type { ReactNode } from "react";
import { currentUser, publicUser } from "@/lib/auth.ts";
import { SessionProvider } from "@/ui/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASL // AI 红队靶场",
  description: "本地 AI 红队靶场",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <SessionProvider user={user ? publicUser(user) : null}>{children}</SessionProvider>
      </body>
    </html>
  );
}

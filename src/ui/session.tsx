"use client";
/**当前登录账号：根布局在服务端取一次，客户端组件经 useSessionUser 读。 */
import { createContext, type ReactNode, useContext } from "react";
import type { PublicUser } from "./types";

const SessionContext = createContext<PublicUser | null>(null);

export function SessionProvider({ user, children }: { user: PublicUser | null; children: ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSessionUser(): PublicUser | null {
  return useContext(SessionContext);
}

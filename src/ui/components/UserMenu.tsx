"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useSessionUser } from "../session";
import { Icon } from "./Icon";

const ITEM =
  "w-full flex items-center gap-2.5 px-3 h-9 rounded-md text-left text-[13px] text-ink-2 hover:bg-sunken hover:text-ink";

function MenuLink({ href, icon, children }: { href: string; icon: string; children: ReactNode }) {
  return (
    <Link href={href} className={ITEM}>
      <Icon name={icon} size={14} className="text-muted" />
      {children}
    </Link>
  );
}

/**顶栏账号菜单：改密、重置本人进度、退出。管理入口在主导航。 */
export function UserMenu() {
  const user = useSessionUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const resetMine = () => {
    setOpen(false);
    if (!confirm("将你的全部产品与通关进度恢复为初始状态？其他人的数据不受影响。")) return;
    api
      .resetAll()
      .then(() => {
        window.location.href = "/";
      })
      .catch((e) => alert(e instanceof Error ? e.message : String(e)));
  };

  const logout = () => {
    api.logout().finally(() => {
      window.location.href = "/login";
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-sunken transition-colors"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`账号菜单：${user.display_name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="h-7 w-7 rounded-full bg-ink text-white text-[12px] font-semibold flex items-center justify-center">
          {user.display_name.slice(0, 1).toUpperCase()}
        </span>
        <span className="hidden md:block max-w-28 truncate text-[13px] text-ink">{user.display_name}</span>
        <Icon name="chevron-down" size={14} className="text-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 w-60 card shadow-pop p-1.5 z-50 rise-in">
          <div className="px-3 pt-2 pb-3 border-b border-line mb-1.5">
            <div className="text-[14px] font-medium text-ink truncate">{user.display_name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
              <span className="font-mono truncate">{user.username}</span>
              <span aria-hidden>·</span>
              <span>{user.is_admin ? "管理员" : "学员"}</span>
            </div>
          </div>
          <MenuLink href="/account/password" icon="key">
            修改密码
          </MenuLink>
          <button type="button" className={ITEM} onClick={resetMine}>
            <Icon name="refresh" size={14} className="text-muted" />
            重置我的进度
          </button>
          <div className="border-t border-line my-1.5" />
          <button type="button" className={ITEM} onClick={logout}>
            <Icon name="log-out" size={14} className="text-muted" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

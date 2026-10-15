"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useSessionUser } from "../session";
import { Icon } from "./Icon";

const ITEM =
  "w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-elevated hover:text-slate-100";

function MenuLink({ href, icon, children }: { href: string; icon: string; children: ReactNode }) {
  return (
    <Link href={href} className={ITEM}>
      <Icon name={icon} size={12} className="text-dim" />
      {children}
    </Link>
  );
}

/**顶栏账号菜单：改密、账号管理（管理员）、重置本人进度、退出。 */
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
        className="chip hover:text-slate-100"
        aria-expanded={open}
        title={`当前账号：${user.username}`}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="user" size={10} />
        <span className="max-w-32 truncate">{user.display_name}</span>
        <Icon name="chevron-down" size={10} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 panel py-1 shadow-pop z-40 text-[12px]">
          <div className="px-3 py-2 border-b border-edge mb-1">
            <div className="text-slate-100 truncate">{user.display_name}</div>
            <div className="text-dim font-mono text-[11px] truncate">
              {user.username}
              {user.is_admin ? " · 管理员" : ""}
            </div>
          </div>
          <MenuLink href="/account/password" icon="key">
            修改密码
          </MenuLink>
          {user.is_admin && (
            <MenuLink href="/admin" icon="users">
              账号管理
            </MenuLink>
          )}
          <button type="button" className={ITEM} onClick={resetMine}>
            <Icon name="refresh" size={12} className="text-dim" />
            重置我的进度
          </button>
          <div className="border-t border-edge my-1" />
          <button type="button" className={ITEM} onClick={logout}>
            <Icon name="arrow-right" size={12} className="text-dim" />
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

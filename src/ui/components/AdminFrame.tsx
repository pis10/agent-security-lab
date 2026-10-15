"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Meta, ProgressMap } from "../types";
import { Icon } from "./Icon";
import { PageHeader, Shell } from "./Shell";

export type AdminSection = "users" | "progress" | "model";

const ITEMS: { id: AdminSection; href: string; label: string; icon: string; hint: string }[] = [
  { id: "users", href: "/admin", label: "账号管理", icon: "users", hint: "建号、重置密码、停用" },
  { id: "progress", href: "/admin/progress", label: "教学进度", icon: "activity", hint: "五关矩阵、复测、CSV" },
  { id: "model", href: "/admin/model", label: "模型设置", icon: "cpu", hint: "服务、Key、测试连接" },
];

/**管理后台：顶栏下方左侧导航，右侧内容；窄屏时导航横向排列。 */
export function AdminFrame({
  active,
  meta,
  progress,
  scenarioCount,
  title,
  description,
  actions,
  children,
}: {
  active: AdminSection;
  meta: Meta;
  progress: ProgressMap;
  scenarioCount: number;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Shell active="admin" meta={meta} progress={progress} scenarioCount={scenarioCount}>
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 py-6 sm:py-8 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="管理" className="lg:sticky lg:top-20 self-start">
          <div className="eyebrow px-3 mb-2 hidden lg:block">管理</div>
          <ul className="flex lg:flex-col gap-1 overflow-x-auto">
            {ITEMS.map((item) => {
              const on = item.id === active;
              return (
                <li key={item.id} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                      on
                        ? "bg-surface border border-line shadow-raise text-ink"
                        : "text-ink-2 hover:bg-sunken hover:text-ink"
                    }`}
                  >
                    <Icon name={item.icon} size={15} className={on ? "text-brand" : "text-muted"} />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium">{item.label}</span>
                      <span className="hidden lg:block text-[11px] text-muted">{item.hint}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <main className="min-w-0">
          <PageHeader title={title} description={description} actions={actions} />
          {children}
        </main>
      </div>
    </Shell>
  );
}

"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { api, onProgressChanged } from "../api";
import { useSessionUser } from "../session";
import type { Meta, ProgressMap } from "../types";
import { ModelBadge } from "./Badge";
import { Icon } from "./Icon";
import { UserMenu } from "./UserMenu";

export type AppSection = "home" | "observe" | "admin";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 shrink-0 rounded-md" aria-label="返回首页">
      <span className="h-8 w-8 rounded-lg bg-brand text-white flex items-center justify-center">
        <Icon name="target" size={17} strokeWidth={2} />
      </span>
      <span className="leading-tight">
        <span className="block font-mono font-bold text-[15px] tracking-tight text-ink">ASL</span>
        {!compact && <span className="hidden lg:block text-[11px] text-muted">Agent 安全靶场</span>}
      </span>
    </Link>
  );
}

export function MainNav({ active }: { active?: AppSection }) {
  const user = useSessionUser();
  const items: { to: string; id: AppSection; label: string }[] = [
    { to: "/", id: "home", label: "学习" },
    { to: "/observe", id: "observe", label: "观测" },
  ];
  if (user?.is_admin) items.push({ to: "/admin", id: "admin", label: "管理" });
  return (
    <nav aria-label="主导航" className="flex items-center gap-0.5">
      {items.map((item) => {
        const on = active === item.id;
        return (
          <Link
            key={item.id}
            href={item.to}
            aria-current={on ? "page" : undefined}
            className={`h-9 px-3 inline-flex items-center rounded-lg text-[14px] transition-colors ${
              on ? "bg-sunken text-ink font-medium" : "text-ink-2 hover:text-ink hover:bg-sunken"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**已通关 x/N，分段条。 */
export function ProgressPill({ captured, total }: { captured: number; total: number }) {
  return (
    <Link
      href="/"
      className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg hover:bg-sunken transition-colors"
      title="学习进度"
    >
      <span className="flex gap-0.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => `seg-${i}`).map((key, i) => (
          <span key={key} className={`h-2 w-3 rounded-[2px] ${i < captured ? "bg-ok" : "bg-line"}`} />
        ))}
      </span>
      <span className="text-[13px] text-ink-2 tabular-nums">
        已通关 {captured}/{total}
      </span>
    </Link>
  );
}

/**登录者的进度：首屏用服务端数据，之后随通关事件刷新。 */
export function useLiveProgress(initial: ProgressMap): ProgressMap {
  const [progress, setProgress] = useState(initial);
  useEffect(() => {
    setProgress(initial);
  }, [initial]);
  useEffect(() => {
    return onProgressChanged(() => {
      api
        .progress()
        .then(setProgress)
        .catch(() => {});
    });
  }, []);
  return progress;
}

export function Shell({
  children,
  active,
  meta,
  progress: initialProgress,
  scenarioCount,
}: {
  children: ReactNode;
  active?: AppSection;
  meta: Meta;
  progress: ProgressMap;
  scenarioCount: number;
}) {
  const progress = useLiveProgress(initialProgress);
  const captured = Object.keys(progress).length;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-[1440px] h-14 px-4 sm:px-6 flex items-center gap-3 sm:gap-6">
          <BrandMark />
          <MainNav active={active} />
          <span className="flex-1" />
          <ProgressPill captured={captured} total={scenarioCount} />
          <span className="hidden md:inline-flex">
            <ModelBadge model={meta.llm_model} />
          </span>
          <UserMenu />
        </div>
      </header>
      {children}
    </div>
  );
}

/**页面标题区：小标题、主标题、说明与右侧操作。 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight text-ink leading-tight">{title}</h1>
        {description && <div className="mt-2 text-[14px] leading-relaxed text-ink-2">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

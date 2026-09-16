import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { api, onProgressChanged } from "../api";
import type { Meta, ProgressMap } from "../types";
import { LlmBadge } from "./Badge";
import { Icon } from "./Icon";

export type AppSection = "range" | "learn" | "observe";

const NAV: { to: string; id: AppSection; label: string }[] = [
  { to: "/", id: "range", label: "靶场" },
  { to: "/learn", id: "learn", label: "教学" },
  { to: "/observe", id: "observe", label: "观测" },
];

export function AppNav({
  active,
  compact = false,
}: {
  active?: AppSection;
  compact?: boolean;
}) {
  return (
    <nav className={compact ? "hidden sm:flex items-center gap-0.5 text-[12px]" : "flex items-center gap-1 text-[13px]"}>
      {NAV.map((item) => {
        const on = active === item.id;
        return (
          <Link
            key={item.id}
            to={item.to}
            className={
              compact
                ? `px-1.5 py-0.5 rounded ${on ? "text-slate-200 bg-elevated" : "text-dim hover:text-slate-200 hover:bg-elevated"}`
                : `px-2.5 py-1 rounded-md transition-colors ${on ? "bg-elevated text-slate-100" : "text-dim hover:text-slate-200"}`
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({
  children,
  active,
}: {
  children: ReactNode;
  active: AppSection;
}) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [scenarioCount, setScenarioCount] = useState(0);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => {});
    api.scenarios().then((s) => setScenarioCount(s.length)).catch(() => {});
    const loadProgress = () => api.progress().then(setProgress).catch(() => {});
    loadProgress();
    return onProgressChanged(loadProgress);
  }, []);

  const captured = Object.keys(progress).length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      <header className="border-b border-slate-800 bg-[#111827] text-slate-200 sticky top-0 z-10">
        <div className="w-full px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/" className="font-mono text-accent font-bold text-lg flex items-center gap-2 shrink-0">
              <Icon name="target" size={18} />
              ASL
            </Link>
            <AppNav active={active} />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="chip text-ok border-ok/40" title="已完成的课程">
              <Icon name="flag" size={10} />
              {captured}/{scenarioCount || "–"}
            </span>
            {meta && <LlmBadge model={meta.llm_model} />}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}

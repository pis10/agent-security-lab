"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { tierRank } from "../scenarios/types.ts";
import { api } from "./api";
import { observeUrl, productOf, rangeUrl } from "./catalog";
import { Tag, TierBadge } from "./components/Badge";
import { Icon } from "./components/Icon";
import { PageHeader, Shell, useLiveProgress } from "./components/Shell";
import type { Meta, ProgressMap, Scenario, TargetInfo, WorldInfo } from "./types";

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>
      <div className={`text-[18px] font-semibold tabular-nums ${value > 0 && tone ? tone : "text-ink"}`}>{value}</div>
    </div>
  );
}

/**观测总览：四个产品的调用、外发与防护一览，进入后看完整时间线。 */
export function ObserveBoard({
  worlds: initialWorlds,
  targets,
  scenarios,
  meta,
  progress: initialProgress,
}: {
  worlds: WorldInfo[];
  targets: TargetInfo[];
  scenarios: Scenario[];
  meta: Meta;
  progress: ProgressMap;
}) {
  const [worlds, setWorlds] = useState(initialWorlds);
  const progress = useLiveProgress(initialProgress);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      api
        .listWorlds()
        .then(setWorlds)
        .catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const firstTier = (id: string) =>
    Math.min(...scenarios.filter((s) => s.target === id).map((s) => tierRank(s.tier)), 99);
  const ordered = [...targets].sort((a, b) => firstTier(a.id) - firstTier(b.id));

  return (
    <Shell active="observe" meta={meta} progress={initialProgress} scenarioCount={scenarios.length}>
      <main className="mx-auto max-w-[1200px] px-4 sm:px-6 py-8 sm:py-10">
        <PageHeader
          eyebrow="观测"
          title="观测与复盘"
          description="助手的每一次工具调用、发往站外的内容和防护拦截都记录在这里，服务重启后仍会保留。做题时也可以在工作台右侧直接打开观测。"
        />
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))]">
          {ordered.map((t) => {
            const product = productOf(t.id);
            const w = worlds.find((x) => x.target_id === t.id);
            const related = scenarios
              .filter((s) => s.target === t.id)
              .sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
            return (
              <div key={t.id} className="card p-5 flex flex-col">
                <div className="flex items-start gap-3">
                  <span
                    className={`h-10 w-10 rounded-xl bg-linear-to-br ${product.mark} text-white flex items-center justify-center shrink-0`}
                  >
                    <Icon name={product.icon} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-ink">{product.brand}</div>
                    <div className="text-[12px] text-muted mt-0.5">{product.tagline}</div>
                  </div>
                  {w?.run_status && w.run_status !== "idle" && <Tag tone="info">运行中</Tag>}
                </div>
                {w ? (
                  <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-sunken/60 px-4 py-3">
                    <Metric label="记录" value={w.event_count} />
                    <Metric label="外发" value={w.sink_count} tone="text-danger" />
                    <Metric label="防护" value={w.enabled_defenses.length} tone="text-ok" />
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-line px-4 py-3 text-[12px] text-muted">
                    还没有打开过这个产品
                  </div>
                )}
                <ul className="mt-4 space-y-1.5 flex-1">
                  {related.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 text-[13px]">
                      <TierBadge tier={s.tier} size="sm" />
                      <span className={`truncate ${progress[s.id] ? "text-ok" : "text-ink-2"}`}>{s.title}</span>
                      {progress[s.id] && <Icon name="check" size={13} className="text-ok shrink-0" />}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-2">
                  {w ? (
                    <Link href={observeUrl(t.id)} className="btn-primary btn-sm">
                      <Icon name="activity" size={13} />
                      查看记录
                    </Link>
                  ) : null}
                  <Link href={rangeUrl(t.id)} className={w ? "btn-ghost btn-sm" : "btn btn-sm"}>
                    进入产品
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </Shell>
  );
}

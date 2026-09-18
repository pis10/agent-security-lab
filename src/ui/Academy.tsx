"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { tierRank } from "../scenarios/types.ts";
import { api, onProgressChanged } from "./api";
import { productOf } from "./catalog";
import { TierBadge } from "./components/Badge";
import { Icon } from "./components/Icon";
import { Shell } from "./components/Shell";
import type { Meta, ProgressMap, Scenario } from "./types";

export function Academy({
  scenarios,
  progress: initialProgress,
  meta,
}: {
  scenarios: Scenario[];
  progress: ProgressMap;
  meta: Meta;
}) {
  const [progress, setProgress] = useState(initialProgress);

  useEffect(() => {
    setProgress(initialProgress);
  }, [initialProgress]);

  useEffect(() => {
    return onProgressChanged(() => {
      api
        .progress()
        .then(setProgress)
        .catch(() => {});
    });
  }, []);

  const captured = Object.keys(progress).length;
  const ordered = [...scenarios].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  const nextLesson = ordered.find((s) => !progress[s.id]) ?? null;

  return (
    <Shell active="learn" meta={meta} progress={progress} scenarioCount={scenarios.length}>
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">教学</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">课程</h1>
          <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
            请按关卡编号顺序进行。先阅读本关目标与原理，再进入产品尝试；遇到困难时再查看答案。
          </p>
          <div className="mt-3 text-[13px] text-slate-400">
            已完成 {captured}/{scenarios.length}
          </div>
        </div>
        {nextLesson && (
          <Link
            href={`/learn/${nextLesson.id}`}
            className="w-full p-card p-4 flex items-center gap-3 hover:border-slate-300 transition-colors mb-5"
          >
            <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Icon name={captured === 0 ? "book-open" : "zap"} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-slate-900">
                {captured === 0 ? "开始第一关" : "继续下一关"}
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5 truncate">
                {nextLesson.tier} · {nextLesson.title} · {productOf(nextLesson.target).brand}
              </div>
            </div>
            <Icon name="arrow-right" size={15} className="text-slate-300 shrink-0" />
          </Link>
        )}
        <div className="p-card overflow-hidden divide-y divide-slate-100">
          {ordered.map((s) => {
            const product = productOf(s.target);
            const done = !!progress[s.id];
            return (
              <Link
                href={`/learn/${s.id}`}
                key={s.id}
                className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors"
              >
                <Icon
                  name={done ? "check" : "book-open"}
                  size={14}
                  className={done ? "text-emerald-600" : "text-slate-300"}
                />
                <TierBadge tier={s.tier} light />
                <span className={`text-[13px] flex-1 ${done ? "text-emerald-700" : "text-slate-800"}`}>{s.title}</span>
                <span className="text-[11px] text-slate-400 hidden sm:inline">{product.brand}</span>
                {s.vuln_class && <span className="text-[11px] text-slate-400 hidden md:inline">{s.vuln_class}</span>}
                <Icon name="chevron-right" size={14} className="text-slate-300" />
              </Link>
            );
          })}
        </div>
      </main>
    </Shell>
  );
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, onProgressChanged } from "../api";
import { productOf } from "../catalog";
import { TierBadge } from "../components/Badge";
import { Icon } from "../components/Icon";
import { Shell } from "../components/Shell";
import type { ProgressMap, Scenario, TargetInfo } from "../types";

export function Academy() {
  const [targets, setTargets] = useState<TargetInfo[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loaded, setLoaded] = useState(false);
  const nav = useRouter();

  useEffect(() => {
    document.title = "ASL · 教学";
    Promise.all([api.targets(), api.scenarios(), api.progress()])
      .then(([t, s, p]) => {
        setTargets(t);
        setScenarios(s);
        setProgress(p);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    return onProgressChanged(() => {
      api
        .progress()
        .then(setProgress)
        .catch(() => {});
    });
  }, []);

  const captured = Object.keys(progress).length;
  const tierRank = (tier: string) => Number.parseInt(tier.replace(/\D/g, ""), 10) || 0;
  const nextLesson =
    [...scenarios].sort((a, b) => tierRank(a.tier) - tierRank(b.tier)).find((s) => !progress[s.id]) ?? null;

  return (
    <Shell active="learn">
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">教学</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">课程</h1>
          <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
            先看目标和成功判据，再进产品自己构造攻击。建议按 L1→L5 顺序推进；打成了才有这条链的解析。
          </p>
          {loaded && (
            <div className="mt-3 text-[13px] text-slate-400">
              已完成 {captured}/{scenarios.length}
            </div>
          )}
        </div>
        {loaded && nextLesson && (
          <button
            type="button"
            onClick={() => nav.push(`/learn/${nextLesson.id}`)}
            className="w-full p-card p-4 flex items-center gap-3 hover:border-slate-300 transition-colors text-left"
          >
            <div className="h-9 w-9 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Icon name={captured === 0 ? "book-open" : "zap"} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-slate-900">
                {captured === 0 ? "从这里开始" : "继续学习"}
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5 truncate">
                {nextLesson.tier} · {nextLesson.title} · {productOf(nextLesson.target).brand}
              </div>
            </div>
            <Icon name="arrow-right" size={15} className="text-slate-300 shrink-0" />
          </button>
        )}
        <div className="space-y-5">
          {targets.map((t) => {
            const product = productOf(t.id);
            const related = scenarios
              .filter((s) => s.target === t.id)
              .sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
            if (related.length === 0) return null;
            const solved = related.filter((s) => progress[s.id]).length;
            return (
              <section key={t.id} className="p-card overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
                  <div
                    className={`h-9 w-9 rounded-lg bg-gradient-to-br ${product.mark} text-white flex items-center justify-center shrink-0`}
                  >
                    <Icon name={product.icon} size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{product.brand}</div>
                    <div className="text-[11px] text-slate-400">{t.tier_focus}</div>
                  </div>
                  <span
                    className={`chip-light ${solved === related.length ? "text-emerald-700 border-emerald-200" : ""}`}
                  >
                    {solved}/{related.length}
                  </span>
                  <Link
                    href={`/range/${t.id}`}
                    className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-600 hover:border-slate-300 hover:text-slate-900"
                  >
                    打开产品
                  </Link>
                </div>
                <div className="divide-y divide-slate-100">
                  {related.map((s) => {
                    const done = !!progress[s.id];
                    return (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => nav.push(`/learn/${s.id}`)}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                      >
                        <Icon
                          name={done ? "check" : "book-open"}
                          size={14}
                          className={done ? "text-emerald-600" : "text-slate-300"}
                        />
                        <TierBadge tier={s.tier} light />
                        <span className={`text-[13px] flex-1 ${done ? "text-emerald-700" : "text-slate-800"}`}>
                          {s.title}
                        </span>
                        {s.vuln_class && (
                          <span className="text-[11px] text-slate-400 hidden sm:inline">{s.vuln_class}</span>
                        )}
                        {s.hints.length > 0 && (
                          <span className="text-[11px] text-slate-400 hidden sm:inline">有提示</span>
                        )}
                        <Icon name="chevron-right" size={14} className="text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </main>
    </Shell>
  );
}

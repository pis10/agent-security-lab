"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "./api";
import { productOf } from "./catalog";
import { Icon } from "./components/Icon";
import { Shell } from "./components/Shell";
import type { Meta, ProgressMap, WorldInfo } from "./types";

export function ObserveBoard({
  worlds: initialWorlds,
  meta,
  progress,
  scenarioCount,
}: {
  worlds: WorldInfo[];
  meta: Meta;
  progress: ProgressMap;
  scenarioCount: number;
}) {
  const [worlds, setWorlds] = useState(initialWorlds);
  const nav = useRouter();

  useEffect(() => {
    setWorlds(initialWorlds);
  }, [initialWorlds]);

  // 仅剩一个世界时进详情
  useEffect(() => {
    if (worlds.length === 1) {
      nav.replace(`/observe/${worlds[0].target_id}`);
    }
  }, [worlds, nav]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      api
        .listWorlds()
        .then(setWorlds)
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  if (worlds.length === 0) {
    return (
      <Shell active="observe" meta={meta} progress={progress} scenarioCount={scenarioCount}>
        <main className="max-w-xl mx-auto px-6 py-20 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">观测</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">观测</h1>
          <p className="text-slate-500 text-sm mt-3 leading-relaxed">
            打开一款产品之后，助手的操作记录和外发会显示在这里。关掉服务器再开也还在，直到你点重置。
          </p>
          <Link
            href="/"
            className="inline-flex mt-6 items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] px-3 py-1.5"
          >
            打开靶场
          </Link>
        </main>
      </Shell>
    );
  }

  return (
    <Shell active="observe" meta={meta} progress={progress} scenarioCount={scenarioCount}>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">观测</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">观测</h1>
          <p className="text-slate-500 text-sm mt-2 leading-relaxed">已打开过的产品。课程还在教学页。</p>
        </div>
        <div className="space-y-3">
          {worlds.map((w) => {
            const product = productOf(w.target_id);
            return (
              <Link
                href={`/observe/${w.target_id}`}
                key={w.target_id}
                className="w-full p-card p-4 text-left hover:border-slate-300 hover:shadow-product transition-all group flex items-center gap-3"
              >
                <div
                  className={`h-10 w-10 rounded-xl bg-linear-to-br ${product.mark} text-white flex items-center justify-center shadow-product shrink-0`}
                >
                  <Icon name={product.icon} size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 text-[14px]">{product.brand}</div>
                  <div className="text-[12px] text-slate-400 mt-0.5">
                    记录 {w.event_count} · 外发 {w.sink_count}
                    {w.enabled_defenses.length ? ` · 已开 ${w.enabled_defenses.length} 项防护` : ""}
                  </div>
                </div>
                <Icon
                  name="arrow-right"
                  size={16}
                  className="text-slate-300 group-hover:text-slate-700 transition-colors"
                />
              </Link>
            );
          })}
        </div>
      </main>
    </Shell>
  );
}

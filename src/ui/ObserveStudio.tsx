"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { productOf, rangeUrl } from "./catalog";
import { DefenseToggles } from "./components/DefenseToggles";
import { EventTimeline } from "./components/EventTimeline";
import { Icon } from "./components/Icon";
import { Shell } from "./components/Shell";
import { SinkInbox } from "./components/SinkInbox";
import type { Meta, Observation, ProgressMap, SinkEvent, TargetInfo, TraceEvent, WorldInfo } from "./types";

function Stat({
  label,
  value,
  hint,
  icon,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: string;
  tone?: "slate" | "red" | "emerald" | "amber";
}) {
  const valueCls = {
    slate: "text-slate-900",
    red: "text-red-600",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
  }[tone];
  return (
    <div className="p-card p-4">
      <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
        <Icon name={icon} size={13} />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${valueCls}`}>{value}</div>
      {hint && <div className="text-[12px] text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

export function ObserveStudio({
  targetId,
  target,
  meta,
  progress,
  scenarioCount,
}: {
  targetId: string;
  target: TargetInfo;
  meta: Meta;
  progress: ProgressMap;
  scenarioCount: number;
}) {
  const nav = useRouter();
  const product = productOf(targetId);

  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [sink, setSink] = useState<SinkEvent[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [defenses, setDefenses] = useState<Set<string>>(new Set());

  const productUrl = rangeUrl(targetId);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);
    api
      .ensureWorld(targetId, null)
      .then((w) => {
        if (cancelled) return;
        setDefenses(new Set(w.enabled_defenses));
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  useEffect(() => {
    if (!ready || error) return;
    const tick = () => {
      if (document.hidden) return;
      api
        .trace(targetId)
        .then(setTrace)
        .catch(() => {});
      api
        .sink(targetId)
        .then(setSink)
        .catch(() => {});
      api
        .observations(targetId)
        .then((body) => setObservations(body.observations))
        .catch(() => {});
      api
        .listWorlds()
        .then(setWorlds)
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [ready, error, targetId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        nav.push(productUrl);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, productUrl]);

  const toolCalls = useMemo(() => trace.filter((e) => e.kind === "tool_call").length, [trace]);
  const blocked = useMemo(() => trace.filter((e) => e.kind === "policy_blocked").length, [trace]);
  const passedHere = observations.filter((o) => o.passed);
  const liveTargets = worlds.map((w) => w.target_id);

  const toggleDefense = (id: string) => {
    const next = new Set(defenses);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDefenses(next);
    api.setDefenses(targetId, [...next]).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  const resetWorld = () => {
    if (!confirm(`将 ${product.brand} 恢复为初始数据？对话、调用记录、外发将被清除，通关进度仅清除当前课程。`)) return;
    api
      .resetWorld(targetId, null)
      .then((w) => {
        setDefenses(new Set(w.enabled_defenses));
        setTrace([]);
        setSink([]);
        setObservations([]);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <Shell active="observe" meta={meta} progress={progress} scenarioCount={scenarioCount}>
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-[12px] text-slate-400 mb-4">
          <Link href="/observe" className="hover:text-slate-700">
            观测
          </Link>
          <Icon name="chevron-right" size={12} />
          <span className="text-slate-600">{product.brand}</span>
        </div>

        {liveTargets.length > 1 && (
          <div className="flex flex-wrap gap-1.5 mb-5">
            {liveTargets.map((id) => {
              const p = productOf(id);
              const on = id === targetId;
              return (
                <Link
                  key={id}
                  href={`/observe/${id}`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] border transition-colors ${
                    on
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                  }`}
                >
                  <Icon name={p.icon} size={12} />
                  {p.brand}
                </Link>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`h-11 w-11 rounded-xl bg-linear-to-br ${product.mark} text-white flex items-center justify-center shadow-product shrink-0`}
            >
              <Icon name={product.icon} size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">{product.brand}</h1>
              <div className="text-[12px] text-slate-400 mt-0.5">
                {defenses.size ? `已启用 ${defenses.size} 项防护` : "调用记录"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={productUrl}
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] px-3 py-1.5"
            >
              <Icon name="arrow-right" size={13} />
              进入产品
            </Link>
            <button
              type="button"
              onClick={resetWorld}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white text-[13px] text-slate-600 px-3 py-1.5 hover:border-slate-300"
            >
              <Icon name="refresh" size={13} />
              重置
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {error}
          </div>
        )}

        {!ready ? (
          <div className="text-slate-400 text-sm py-16 text-center">加载中…</div>
        ) : (
          <>
            {passedHere.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-slate-400">已通关</span>
                {passedHere.map((o) => (
                  <Link
                    key={o.scenario_id}
                    href={`/learn/${o.scenario_id}`}
                    className="chip-light text-emerald-700 border-emerald-200 bg-emerald-50"
                  >
                    <Icon name="check" size={10} />
                    {o.title}
                  </Link>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <Stat label="记录" value={trace.length} hint={`${toolCalls} 次工具调用`} icon="activity" />
              <Stat
                label="外发"
                value={sink.length}
                hint={sink.length ? "存在站外发送" : "暂无外发"}
                icon="inbox"
                tone={sink.length ? "red" : "slate"}
              />
              <Stat
                label="拦截"
                value={blocked}
                hint={defenses.size ? `已启用 ${defenses.size} 项防护` : "请先开启下方防护后再次尝试"}
                icon="shield-alert"
                tone={blocked ? "amber" : "slate"}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">
              <section className="p-card lg:col-span-3 h-[32rem] flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="text-[13px] font-medium text-slate-800">时间线</div>
                  <div className="text-[12px] text-slate-400">对话和工具调用</div>
                </div>
                <EventTimeline events={trace} />
              </section>
              <section className="p-card lg:col-span-2 h-[32rem] flex flex-col min-h-0">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="text-[13px] font-medium text-slate-800">外发</div>
                  <div className="text-[12px] text-slate-400">邮件、HTTP、内网</div>
                </div>
                <SinkInbox events={sink} />
              </section>
            </div>

            <section className="p-card p-4">
              <div className="text-[13px] font-medium text-slate-800 mb-1">防护</div>
              <p className="text-[12px] text-slate-400 mb-3 leading-relaxed max-w-xl">
                开关立即生效，不会清除产品数据。复测时请开启防护，返回产品清空对话后再次尝试，通关记录仍会保留。
              </p>
              <div className="max-w-xl">
                <DefenseToggles defenses={target.defenses} selected={defenses} onToggle={toggleDefense} />
              </div>
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}

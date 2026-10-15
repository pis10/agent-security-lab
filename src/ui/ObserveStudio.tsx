"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { tierRank } from "../scenarios/types.ts";
import { ApiError, api, errorText } from "./api";
import { observeUrl, productOf, rangeUrl } from "./catalog";
import { Tag, TierBadge } from "./components/Badge";
import { DefenseToggles } from "./components/DefenseToggles";
import { EventTimeline } from "./components/EventTimeline";
import { Icon } from "./components/Icon";
import { Shell } from "./components/Shell";
import { SinkInbox } from "./components/SinkInbox";
import { useSessionUser } from "./session";
import {
  LLM_NOT_CONFIGURED,
  type Meta,
  type Observation,
  type ProgressMap,
  type Scenario,
  type SinkEvent,
  type TargetInfo,
  type TraceEvent,
} from "./types";

function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: string;
  tone?: string;
}) {
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-[12px] text-muted">
        <Icon name={icon} size={13} />
        {label}
      </div>
      <div
        className={`mt-1 text-[24px] font-semibold tracking-tight tabular-nums ${value > 0 && tone ? tone : "text-ink"}`}
      >
        {value}
      </div>
      <div className="text-[12px] text-muted mt-0.5">{hint}</div>
    </div>
  );
}

/**单个产品的观测与复盘：时间线、外发箱、防护开关和本产品各关的通关情况。 */
export function ObserveStudio({
  target,
  targets,
  scenarios,
  meta,
  progress,
}: {
  target: TargetInfo;
  targets: TargetInfo[];
  scenarios: Scenario[];
  meta: Meta;
  progress: ProgressMap;
}) {
  const targetId = target.id;
  const product = productOf(targetId);
  const user = useSessionUser();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [sink, setSink] = useState<SinkEvent[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [defenses, setDefenses] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

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
        if (!cancelled) setError({ message: errorText(e), code: e instanceof ApiError ? e.code : "" });
      });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  useEffect(() => {
    if (!ready) return;
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
        .then((list) => setRunning((list.find((w) => w.target_id === targetId)?.run_status ?? "idle") !== "idle"))
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [ready, targetId]);

  const toolCalls = useMemo(() => trace.filter((e) => e.kind === "tool_call").length, [trace]);
  const blocked = useMemo(() => trace.filter((e) => e.kind === "policy_blocked").length, [trace]);
  const related = scenarios.filter((s) => s.target === targetId).sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
  const firstTier = (id: string) =>
    Math.min(...scenarios.filter((s) => s.target === id).map((s) => tierRank(s.tier)), 99);

  const toggleDefense = (id: string) => {
    const prev = defenses;
    const next = new Set(defenses);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDefenses(next);
    api.setDefenses(targetId, [...next]).catch((e) => {
      setDefenses(prev);
      setNotice(errorText(e));
    });
  };

  const resetWorld = () => {
    if (!confirm(`将 ${product.brand} 恢复为初始数据？对话、调用记录、外发将被清除，通关进度仅清除当前关卡。`)) return;
    api
      .resetWorld(targetId, null)
      .then((w) => {
        setDefenses(new Set(w.enabled_defenses));
        setTrace([]);
        setSink([]);
        setObservations([]);
      })
      .catch((e) => setNotice(errorText(e)));
  };

  return (
    <Shell active="observe" meta={meta} progress={progress} scenarioCount={scenarios.length}>
      <main className="mx-auto max-w-[1440px] px-4 sm:px-6 py-6 sm:py-8">
        <nav aria-label="切换产品" className="flex flex-wrap items-center gap-1.5 mb-5">
          <Link href="/observe" className="btn-ghost btn-sm">
            <Icon name="arrow-left" size={13} />
            总览
          </Link>
          <span className="h-5 w-px bg-line mx-1" aria-hidden />
          {[...targets]
            .sort((a, b) => firstTier(a.id) - firstTier(b.id))
            .map((t) => {
              const p = productOf(t.id);
              const on = t.id === targetId;
              return (
                <Link
                  key={t.id}
                  href={observeUrl(t.id)}
                  aria-current={on ? "page" : undefined}
                  className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-lg text-[13px] border transition-colors ${
                    on ? "bg-ink text-white border-ink" : "bg-surface text-ink-2 border-line hover:border-line-strong"
                  }`}
                >
                  <Icon name={p.icon} size={13} />
                  {p.brand}
                </Link>
              );
            })}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className={`h-11 w-11 rounded-xl bg-linear-to-br ${product.mark} text-white flex items-center justify-center shrink-0`}
            >
              <Icon name={product.icon} size={20} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[22px] font-semibold tracking-tight text-ink flex items-center gap-2">
                {product.brand}
                {running && <Tag tone="info">助手处理中</Tag>}
              </h1>
              <div className="text-[13px] text-muted mt-0.5">{product.tagline} · 观测记录</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={rangeUrl(targetId)} className="btn-primary">
              进入产品
              <Icon name="arrow-right" size={13} />
            </Link>
            <button type="button" onClick={resetWorld} className="btn" disabled={!ready}>
              <Icon name="refresh" size={13} />
              重置
            </button>
          </div>
        </div>

        {notice && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/25 bg-danger-soft px-4 py-2.5 text-[13px] text-danger"
          >
            {notice}
          </div>
        )}

        {error ? (
          <div className="card p-6 text-center max-w-lg mx-auto">
            <h2 className="text-[16px] font-semibold text-ink">
              {error.code === LLM_NOT_CONFIGURED ? "尚未配置模型" : "无法读取记录"}
            </h2>
            <p className="mt-1.5 text-[13px] text-ink-2">
              {error.code === LLM_NOT_CONFIGURED && !user?.is_admin
                ? "管理员还没有配置模型，请联系管理员。"
                : error.message}
            </p>
            {error.code === LLM_NOT_CONFIGURED && user?.is_admin && (
              <Link href="/admin/model" className="btn-primary mt-4">
                去配置模型
              </Link>
            )}
          </div>
        ) : !ready ? (
          <div className="text-muted text-[13px] py-20 text-center">加载中…</div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Stat label="记录" value={trace.length} hint={`其中工具调用 ${toolCalls} 次`} icon="activity" />
                <Stat
                  label="外发"
                  value={sink.length}
                  hint={sink.length ? "存在发往站外的内容" : "暂无外发"}
                  icon="send"
                  tone="text-danger"
                />
                <Stat
                  label="拦截"
                  value={blocked}
                  hint={defenses.size ? `已开启 ${defenses.size} 项防护` : "防护未开启"}
                  icon="shield-alert"
                  tone="text-warn"
                />
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <section className="card h-[36rem] flex flex-col min-h-0 overflow-hidden">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <h2 className="text-[14px] font-semibold text-ink">时间线</h2>
                    <span className="text-[12px] text-muted">对话、工具调用与拦截</span>
                  </div>
                  <EventTimeline events={trace} />
                </section>
                <section className="card h-[36rem] flex flex-col min-h-0 overflow-hidden">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <h2 className="text-[14px] font-semibold text-ink">外发箱</h2>
                    <span className="text-[12px] text-muted">邮件、HTTP、内网</span>
                  </div>
                  <SinkInbox events={sink} />
                </section>
              </div>
            </div>

            <aside className="space-y-5">
              <section className="card p-4">
                <h2 className="text-[14px] font-semibold text-ink">防护</h2>
                <p className="text-[12px] text-muted mt-1 mb-3 leading-relaxed">
                  开关立即生效，不清除产品数据。复测时开启防护，回到产品清空对话后再试一次。
                </p>
                <DefenseToggles
                  defenses={target.defenses}
                  selected={defenses}
                  onToggle={toggleDefense}
                  disabled={running}
                />
              </section>
              <section className="card p-4">
                <h2 className="text-[14px] font-semibold text-ink mb-3">本产品的关卡</h2>
                <ul className="space-y-2.5">
                  {related.map((s) => {
                    const obs = observations.find((o) => o.scenario_id === s.id);
                    const done = !!progress[s.id] || obs?.passed;
                    return (
                      <li key={s.id}>
                        <Link href={rangeUrl(targetId, s.id)} className="group flex items-start gap-2.5">
                          <TierBadge tier={s.tier} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] text-ink group-hover:underline underline-offset-4">
                              {s.title}
                            </span>
                            <span className="block text-[12px] text-muted mt-0.5">
                              {done
                                ? "已通关"
                                : obs && obs.total > 0
                                  ? `条件 ${obs.passed_count}/${obs.total}`
                                  : "未开始"}
                            </span>
                          </span>
                          {done && <Icon name="check" size={14} className="text-ok mt-0.5" />}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </aside>
          </div>
        )}
      </main>
    </Shell>
  );
}

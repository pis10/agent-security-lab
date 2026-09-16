"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, onProgressChanged } from "./api";
import { productOf } from "./catalog";
import { Tag, TierBadge } from "./components/Badge";
import { Icon } from "./components/Icon";
import { Shell } from "./components/Shell";
import type { Meta, Observation, ProgressMap, Scenario, TargetInfo } from "./types";
import { assertionLabel } from "./types";

/**课程页折叠抽屉。 */
function Drawer({
  icon,
  label,
  children,
  tone = "slate",
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
  tone?: "slate" | "emerald";
}) {
  const toneCls = tone === "emerald" ? "text-emerald-600" : "text-slate-400";
  return (
    <details className="p-card p-4 group">
      <summary className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] cursor-pointer select-none">
        <Icon name={icon} size={12} className={toneCls} />
        <span className={toneCls}>{label}</span>
        <Icon
          name="chevron-down"
          size={12}
          className="ml-auto text-slate-300 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-3 text-[13px] leading-relaxed text-slate-600">{children}</div>
    </details>
  );
}

export function Lesson({
  scenario,
  target,
  progress: initialProgress,
  meta,
  scenarioCount,
}: {
  scenario: Scenario;
  target: TargetInfo;
  progress: ProgressMap;
  meta: Meta;
  scenarioCount: number;
}) {
  const [progress, setProgress] = useState(initialProgress);
  const [obs, setObs] = useState<Observation[]>([]);

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

  useEffect(() => {
    const refresh = () =>
      api
        .observations(scenario.target)
        .then((b) => setObs(b.observations))
        .catch(() => {});
    refresh();
    return onProgressChanged(refresh);
  }, [scenario.target]);

  const product = productOf(scenario.target);
  const done = !!progress[scenario.id];
  const obsMine = obs.find((o) => o.scenario_id === scenario.id);
  const checks = scenario.assertions.map((a, i) => ({
    label: assertionLabel(a) || obsMine?.checks?.[i]?.label || `判据 ${i + 1}`,
    passed: obsMine?.checks?.[i]?.passed ?? false,
  }));
  const rangeFree = `/range/${scenario.target}`;
  const rangeMission = `/range/${scenario.target}?mission=${encodeURIComponent(scenario.id)}`;

  return (
    <Shell active="learn" meta={meta} progress={progress} scenarioCount={scenarioCount}>
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-[12px] text-slate-400 mb-6">
          <Link href="/learn" className="hover:text-slate-700">
            教学
          </Link>
          <Icon name="chevron-right" size={12} />
          <span>{product.brand}</span>
          <Icon name="chevron-right" size={12} />
          <span className="text-slate-600 truncate">{scenario.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8">
          <article className="min-w-0 space-y-8">
            <header>
              <div className="flex items-center gap-2 mb-2">
                <TierBadge tier={scenario.tier} light />
                {scenario.vuln_class && <Tag text={scenario.vuln_class} light />}
                {done && (
                  <span className="chip-light text-emerald-700 border-emerald-200 bg-emerald-50">
                    <Icon name="check" size={10} />
                    已完成
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{scenario.title}</h1>
              <p className="text-[13px] text-slate-400 mt-2">
                产品 {product.brand} · {target.tier_focus}
              </p>
            </header>

            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
                <Icon name="book-open" size={12} />
                原理
              </h2>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700">{scenario.principle}</p>
            </section>

            <section>
              <div className="rounded-lg bg-slate-900 px-4 py-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 mb-1.5">
                  <Icon name="target" size={11} />
                  目标
                </div>
                <p className="text-[15px] leading-relaxed text-slate-100">{scenario.goal}</p>
              </div>
            </section>

            <section>
              <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-2">
                <Icon name="flag" size={12} />
                通关判定
              </h2>
              {checks.length > 0 ? (
                <ul className="space-y-1.5">
                  {checks.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-[14px] leading-relaxed">
                      {c.passed ? (
                        <Icon name="check" size={13} className="mt-1 text-emerald-600 shrink-0" />
                      ) : (
                        <span className="mt-[8px] h-[6px] w-[6px] rounded-full border border-slate-300 shrink-0" />
                      )}
                      <span className={c.passed ? "text-emerald-700" : "text-slate-600"}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] leading-relaxed text-slate-700">
                  观测页里能看到真实危害：数据出了产品、越权读到了、不该跑的命令跑了。
                </p>
              )}
              <p className="text-[12px] text-slate-400 mt-2">
                判定看副作用，不看模型嘴上说；证据在观测页的轨迹与外发箱里。
              </p>
            </section>

            <Drawer icon="lightbulb" label="答案">
              <p className="whitespace-pre-wrap">{scenario.solution}</p>
            </Drawer>

            {scenario.defenses.length > 0 && (
              <Drawer icon="shield" label="本关防护" tone={done ? "emerald" : "slate"}>
                <p className="text-slate-500 mb-2">
                  打成后到
                  <Link href={`/observe/${scenario.target}`} className="text-slate-700 hover:underline">
                    观测页打开这些防护
                  </Link>
                  ，重置再打一次，应被拦截。
                </p>
                <ul className="space-y-2">
                  {scenario.defenses.map((d) => (
                    <li key={d.id} className="rounded-md border border-slate-200 px-3 py-2">
                      <div className="text-[13px] font-medium text-slate-800">{d.name}</div>
                      <p className="text-[12px] text-slate-500 mt-0.5">{d.description}</p>
                    </li>
                  ))}
                </ul>
              </Drawer>
            )}
          </article>

          <aside className="lg:sticky lg:top-20 h-fit space-y-3">
            <div className="p-card p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`h-9 w-9 rounded-lg bg-gradient-to-br ${product.mark} text-white flex items-center justify-center`}
                >
                  <Icon name={product.icon} size={16} />
                </div>
                <div>
                  <div className="text-[13px] font-semibold text-slate-900">{product.brand}</div>
                  <div className="text-[11px] text-slate-400">{product.tagline}</div>
                </div>
              </div>
              <Link
                href={rangeMission}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 transition-colors"
              >
                <Icon name="zap" size={14} />
                开始这节课
              </Link>
              <Link
                href={rangeFree}
                className="w-full inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-[13px] text-slate-700 py-2 hover:border-slate-300 transition-colors"
              >
                直接打开 {product.brand}
              </Link>
              <Link
                href={`/observe/${scenario.target}`}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[13px] text-slate-700 py-2 hover:border-slate-300 transition-colors"
              >
                <Icon name="activity" size={14} />
                查看操作记录
              </Link>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                先看原理和目标，再进产品打。卡住再展开答案。
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {target.tier_focus.split("/").map((f) => (
                <Tag key={f} text={f.trim()} light />
              ))}
            </div>
          </aside>
        </div>
      </main>
    </Shell>
  );
}

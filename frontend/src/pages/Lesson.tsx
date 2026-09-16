import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, onProgressChanged } from "../api";
import { productOf } from "../catalog";
import { Tag, TierBadge } from "../components/Badge";
import { Icon } from "../components/Icon";
import { Shell } from "../components/Shell";
import type { Observation, ProgressMap, Scenario, TargetInfo } from "../types";
import { assertionLabel } from "../types";

/** 课程页统一的折叠抽屉：次级内容（提示/原理/防护/解析）共用同一视觉模式。
 * defaultOpen 只在挂载时设置一次，之后完全交给用户开关，避免轮询重渲染把抽屉顶开。 */
function Drawer({
  icon,
  label,
  children,
  defaultOpen = false,
  tone = "slate",
}: {
  icon: string;
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tone?: "slate" | "emerald";
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (defaultOpen && ref.current) ref.current.open = true;
  }, [defaultOpen]);
  const toneCls =
    tone === "emerald" ? "text-emerald-600" : "text-slate-400";
  return (
    <details ref={ref} className="p-card p-4 group">
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

export function Lesson() {
  const { scenarioId = "" } = useParams();
  const nav = useNavigate();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [obs, setObs] = useState<Observation[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    Promise.all([api.scenarios(), api.targets(), api.progress()]).then(([ss, ts, p]) => {
      const s = ss.find((x) => x.id === scenarioId) ?? null;
      setScenario(s);
      setTarget(s ? (ts.find((t) => t.id === s.target) ?? null) : null);
      setProgress(p);
      setMissing(!s);
    });
    return onProgressChanged(() => {
      api.progress().then(setProgress).catch(() => {});
    });
  }, [scenarioId]);

  useEffect(() => {
    const targetId = scenario?.target;
    if (!targetId) return;
    const refresh = () => api.observations(targetId).then((b) => setObs(b.observations)).catch(() => {});
    refresh();
    return onProgressChanged(refresh);
  }, [scenario?.target]);

  useEffect(() => {
    document.title = scenario ? `ASL · ${scenario.title}` : "ASL · 教学";
  }, [scenario]);

  if (missing) {
    return (
      <Shell active="learn">
        <main className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-slate-500 text-sm">找不到这门课</div>
          <Link
            to="/learn"
            className="inline-flex mt-4 items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-300"
          >
            返回课程列表
          </Link>
        </main>
      </Shell>
    );
  }

  if (!scenario) {
    return (
      <Shell active="learn">
        <main className="max-w-3xl mx-auto px-6 py-16 text-slate-400 text-sm">加载中…</main>
      </Shell>
    );
  }

  const product = productOf(scenario.target);
  const done = !!progress[scenario.id];
  const obsMine = obs.find((o) => o.scenario_id === scenario.id);
  const checks = scenario.assertions.map((a, i) => ({
    label: assertionLabel(a) || obsMine?.checks?.[i]?.label || `判据 ${i + 1}`,
    passed: obsMine?.checks?.[i]?.passed ?? false,
  }));
  const GOAL_MARK = "解决本关：";
  const gi = scenario.brief.lastIndexOf(GOAL_MARK);
  const context = (gi >= 0 ? scenario.brief.slice(0, gi) : "").trim();
  const goal = (gi >= 0 ? scenario.brief.slice(gi + GOAL_MARK.length) : scenario.brief).trim();
  const rangeFree = `/range/${scenario.target}`;
  const rangeMission = `/range/${scenario.target}?mission=${encodeURIComponent(scenario.id)}`;

  return (
    <Shell active="learn">
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 text-[12px] text-slate-400 mb-6">
          <Link to="/learn" className="hover:text-slate-700">
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
                产品 {product.brand} · {target?.tier_focus}
              </p>
            </header>

            <section className="p-card p-5 space-y-4">
              {context && (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700">
                  {context}
                </p>
              )}
              <div className="rounded-lg bg-slate-900 px-4 py-3.5">
                <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 mb-1.5">
                  <Icon name="target" size={11} />
                  {gi >= 0 ? "解决本关" : "任务"}
                </div>
                <p className="text-[15px] leading-relaxed text-slate-100">{goal}</p>
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

            {scenario.hints.length > 0 && (
              <Drawer icon="lightbulb" label="提示">
                <ol className="space-y-2 list-decimal pl-4">
                  {scenario.hints.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </Drawer>
            )}

            {scenario.defenses.length > 0 && done && (
              <Drawer icon="shield" label="本关防护" tone="emerald">
                <p className="text-slate-500 mb-2">
                  到
                  <Link to={`/observe/${scenario.target}`} className="text-slate-700 hover:underline">
                    观测页打开这些防护
                  </Link>
                  ，重置后再打一次，应被拦截。
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

            {done ? (
              scenario.writeup ? (
                <Drawer icon="book-open" label="攻击解析" tone="emerald" defaultOpen>
                  <p className="whitespace-pre-wrap">{scenario.writeup}</p>
                </Drawer>
              ) : null
            ) : (
              <div className="p-card p-4 text-[13px] text-slate-500 flex items-start gap-2">
                <Icon name="lock" size={14} className="mt-0.5 text-slate-400" />
                <span>去产品里找攻击面。目标达成后，解析与防护会出现在这里。</span>
              </div>
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
              <button
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 transition-colors"
                onClick={() => nav(rangeMission)}
              >
                <Icon name="zap" size={14} />
                开始这节课
              </button>
              <button
                className="w-full inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-[13px] text-slate-700 py-2 hover:border-slate-300 transition-colors"
                onClick={() => nav(rangeFree)}
              >
                直接打开 {product.brand}
              </button>
              <button
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[13px] text-slate-700 py-2 hover:border-slate-300 transition-colors"
                onClick={() => nav(`/observe/${scenario.target}`)}
              >
                <Icon name="activity" size={14} />
                查看操作记录
              </button>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                先看目标和成功判据，再进产品自己构造。助手做过什么，去观测页看。
              </p>
            </div>
            {target && (
              <div className="flex flex-wrap gap-1">
                {target.tier_focus.split("/").map((f) => (
                  <Tag key={f} text={f.trim()} light />
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
    </Shell>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { productOf } from "../catalog";
import { Tag, TierBadge } from "../components/Badge";
import { Icon } from "../components/Icon";
import { assertionLabel } from "../components/ObjectiveList";
import { Shell } from "../components/Shell";
import type { ProgressMap, Scenario, TargetInfo } from "../types";

export function Lesson() {
  const { scenarioId = "" } = useParams();
  const nav = useNavigate();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    Promise.all([api.scenarios(), api.targets(), api.progress()]).then(([ss, ts, p]) => {
      const s = ss.find((x) => x.id === scenarioId) ?? null;
      setScenario(s);
      setTarget(s ? (ts.find((t) => t.id === s.target) ?? null) : null);
      setProgress(p);
      setMissing(!s);
    });
  }, [scenarioId]);

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
                {done && (
                  <span className="chip-light text-emerald-700 border-emerald-200 bg-emerald-50">
                    <Icon name="check" size={10} />
                    已观察到
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{scenario.title}</h1>
              <p className="text-[13px] text-slate-400 mt-2">
                产品 {product.brand} · {target?.tier_focus}
              </p>
            </header>

            <section>
              <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-2">
                <Icon name="file-text" size={12} />
                任务简报
              </h2>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-slate-700">
                {scenario.briefing}
              </p>
            </section>

            <section>
              <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-2">
                <Icon name="target" size={12} />
                判定条件（副作用）
              </h2>
              <ul className="space-y-1.5">
                {scenario.assertions.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-slate-600">
                    <Icon
                      name={done ? "check" : "target"}
                      size={13}
                      className={`mt-0.5 ${done ? "text-emerald-600" : "text-slate-300"}`}
                    />
                    {assertionLabel(a)}
                  </li>
                ))}
              </ul>
            </section>

            {scenario.hints.length > 0 && (
              <details className="p-card p-4">
                <summary className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 cursor-pointer">
                  <Icon name="lightbulb" size={12} />
                  提示 ×{scenario.hints.length}
                </summary>
                <ol className="mt-3 space-y-2 text-[13px] text-slate-600 list-decimal pl-4">
                  {scenario.hints.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ol>
              </details>
            )}

            {scenario.defenses.length > 0 && (
              <section>
                <h2 className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 mb-2">
                  <Icon name="shield" size={12} />
                  本课涉及的防护
                </h2>
                <p className="text-[12px] text-slate-400 mb-2">
                  打通之后，
                  <Link to={`/observe/${scenario.target}`} className="text-slate-700 hover:underline">
                    在调查台打开这些防护
                  </Link>
                  ，再攻一次。
                </p>
                <ul className="space-y-2">
                  {scenario.defenses.map((d) => (
                    <li key={d.id} className="p-card p-3">
                      <div className="text-[13px] text-slate-800 flex items-center gap-1.5">
                        <Icon name="shield" size={13} />
                        {d.name}
                      </div>
                      <p className="text-[12px] text-slate-500 mt-1 leading-relaxed">{d.description}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {done ? (
              <section className="space-y-4">
                {scenario.writeup && (
                  <div className="p-card p-4">
                    <h2 className="flex items-center gap-1.5 text-emerald-700 text-sm font-medium">
                      <Icon name="book-open" size={14} />
                      通关解析
                    </h2>
                    <p className="mt-2 text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {scenario.writeup}
                    </p>
                  </div>
                )}
                {scenario.fix_notes && (
                  <div className="p-card p-4">
                    <h2 className="flex items-center gap-1.5 text-emerald-700 text-sm font-medium">
                      <Icon name="shield-check" size={14} />
                      防守对照
                    </h2>
                    <p className="mt-2 text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {scenario.fix_notes}
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <div className="p-card p-4 text-[13px] text-slate-500 flex items-start gap-2">
                <Icon name="lock" size={14} className="mt-0.5 text-slate-400" />
                <span>进入靶场打出本课的副作用后，解析会显示在这里。</span>
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
                带着本课进入靶场
              </button>
              <button
                className="w-full inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-[13px] text-slate-700 py-2 hover:border-slate-300 transition-colors"
                onClick={() => nav(rangeFree)}
              >
                自由进入 {product.brand}
              </button>
              <button
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white text-[13px] text-slate-700 py-2 hover:border-slate-300 transition-colors"
                onClick={() => nav(`/observe/${scenario.target}`)}
              >
                <Icon name="activity" size={14} />
                看本次轨迹
              </button>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                简报和解析在这一页。工具调用和外发在调查台。
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

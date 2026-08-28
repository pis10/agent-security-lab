import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { LlmBadge, Tag, TierBadge } from "../components/Badge";
import type { Meta, ProgressMap, Scenario, TargetInfo } from "../types";

export function MissionBoard() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [targets, setTargets] = useState<TargetInfo[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const nav = useNavigate();

  useEffect(() => {
    Promise.all([api.meta(), api.targets(), api.scenarios(), api.progress()]).then(
      ([m, t, s, p]) => {
        setMeta(m);
        setTargets(t);
        setScenarios(s);
        setProgress(p);
      }
    );
  }, []);

  const captured = Object.keys(progress).length;

  return (
    <div className="min-h-screen">
      <header className="border-b border-edge bg-panel/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-accent font-bold text-lg">ASL</span>
            <span className="font-mono text-xs text-dim">// AI RED TEAM RANGE</span>
            <span className="text-[11px] text-dim">授权训练环境 · 全部 TEST_* dummy 数据</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="chip text-ok border-ok/40">
              进度 {captured}/{scenarios.length}
            </span>
            {meta && <LlmBadge mode={meta.llm_mode} model={meta.llm_model} />}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-xl font-bold mb-1">任务大厅</h1>
        <p className="text-dim text-sm mb-6">
          每个靶标都是一个故意脆弱的真实感 AI 应用。选一张工单，读 briefing，打出攻击链——判定只看副作用。
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {targets.map((t) => {
            const related = scenarios.filter((s) => s.target === t.id);
            const solved = related.filter((s) => progress[s.id]).length;
            return (
              <div key={t.id} className="panel p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-slate-100">{t.name}</div>
                    <div className="text-[11px] font-mono text-dim mt-0.5">{t.id}</div>
                  </div>
                  <span className={`chip ${solved === related.length ? "text-ok border-ok/50" : ""}`}>
                    {solved}/{related.length} flags
                  </span>
                </div>
                <p className="text-[13px] text-slate-400 mt-2 leading-relaxed">{t.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.tier_focus.split("/").map((f) => (
                    <Tag key={f} text={f.trim()} />
                  ))}
                </div>
                <div className="mt-3 pt-3 border-t border-edge space-y-1">
                  {related.map((s) => {
                    const done = !!progress[s.id];
                    return (
                      <button
                        key={s.id}
                        onClick={() => nav(`/t/${t.id}/${s.id}`)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-elevated transition-colors text-left"
                      >
                        <span className={`font-mono text-[11px] ${done ? "text-ok" : "text-dim"}`}>
                          {done ? "◉" : "○"}
                        </span>
                        <TierBadge tier={s.tier} />
                        <span className={`text-[13px] ${done ? "text-ok" : "text-slate-300"}`}>
                          {s.title}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

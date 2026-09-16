import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, onProgressChanged } from "../api";
import { productOf } from "../catalog";
import { Icon } from "../components/Icon";
import { Shell } from "../components/Shell";
import type { ProgressMap, Scenario, TargetInfo } from "../types";

export function RangeBoard() {
  const [targets, setTargets] = useState<TargetInfo[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const nav = useNavigate();

  useEffect(() => {
    document.title = "ASL · 靶场";
    Promise.all([api.targets(), api.scenarios(), api.progress()]).then(([t, s, p]) => {
      setTargets(t);
      setScenarios(s);
      setProgress(p);
    });
    return onProgressChanged(() => {
      api.progress().then(setProgress).catch(() => {});
    });
  }, []);

  return (
    <Shell active="range">
      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">靶场</div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 mt-1">打开一个产品</h1>
          <p className="text-slate-500 text-sm mt-2 max-w-xl leading-relaxed">
            打开产品，自己构造攻击。原理和实战在教学里；助手做过什么记在观测页。
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {targets.map((t) => {
            const product = productOf(t.id);
            const related = scenarios.filter((s) => s.target === t.id);
            const seen = related.filter((s) => progress[s.id]).length;
            return (
              <button
                key={t.id}
                onClick={() => nav(`/range/${t.id}`)}
                className="p-card p-5 text-left hover:border-slate-300 hover:shadow-product transition-all group flex flex-col"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-12 w-12 rounded-xl bg-gradient-to-br ${product.mark} text-white flex items-center justify-center shadow-product shrink-0`}
                  >
                    <Icon name={product.icon} size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 text-[15px]">{product.brand}</div>
                    <div className="text-[12px] text-slate-400 mt-0.5">{product.tagline}</div>
                  </div>
                  <Icon
                    name="arrow-right"
                    size={16}
                    className="text-slate-300 group-hover:text-slate-700 transition-colors mt-1"
                  />
                </div>
                <p className="text-[13px] text-slate-500 mt-3 leading-relaxed flex-1">{product.blurb}</p>
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[12px] text-slate-400">
                  <span>打开应用</span>
                  {related.length > 0 ? (
                    <span className={seen > 0 ? "text-emerald-600" : ""}>
                      {seen > 0 ? `已完成 ${seen}/${related.length}` : `${related.length} 节课`}
                    </span>
                  ) : (
                    <span>自由玩 · 无课程</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </Shell>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { observeUrl, productOf } from "../catalog";
import { LlmBadge } from "../components/Badge";
import { CaptureToast } from "../components/CaptureToast";
import { Icon } from "../components/Icon";
import { AppNav } from "../components/Shell";
import { SIMS } from "../sims";
import type { ChatMessage, Meta, Observation, Scenario, TargetInfo } from "../types";

export function Workspace() {
  const { targetId = "" } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const missionId = params.get("mission") || "";

  const [meta, setMeta] = useState<Meta | null>(null);
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [targetReady, setTargetReady] = useState(false);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [ready, setReady] = useState(false);
  const [appliedDefenses, setAppliedDefenses] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [simState, setSimState] = useState<Record<string, any>>({});
  const [observations, setObservations] = useState<Observation[]>([]);
  const [missionOpen, setMissionOpen] = useState(false);
  const [toast, setToast] = useState<Observation[]>([]);
  const [worldError, setWorldError] = useState<string | null>(null);
  const seenPassed = useRef<Set<string>>(new Set());

  const product = productOf(targetId);
  const isMock = meta?.llm_mode === "mock";

  useEffect(() => {
    document.title = `${product.brand} · ASL`;
    api.meta().then(setMeta).catch(() => {});
  }, [product.brand]);

  useEffect(() => {
    let cancelled = false;
    setTargetReady(false);
    setReady(false);
    Promise.all([api.targets(), api.scenarios()]).then(([targets, scenarios]) => {
      if (cancelled) return;
      setTarget(targets.find((t) => t.id === targetId) ?? null);
      setScenario(scenarios.find((s) => s.id === missionId) ?? null);
      setTargetReady(true);
    });
    setToast([]);
    setWorldError(null);
    api
      .ensureWorld(targetId, missionId || null)
      .then((w) => {
        if (cancelled) return;
        setAppliedDefenses(new Set(w.enabled_defenses));
        setMessages(w.messages ?? []);
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setWorldError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, missionId]);

  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      api.sim(targetId).then(setSimState).catch(() => {});
      api.listWorlds().then((list) => {
        const w = list.find((x) => x.target_id === targetId);
        if (w) setAppliedDefenses(new Set(w.enabled_defenses));
      }).catch(() => {});
      api
        .observations(targetId)
        .then((body) => {
          setObservations(body.observations);
          const fresh = body.observations.filter((o) => o.passed && !seenPassed.current.has(o.scenario_id));
          if (fresh.length) {
            for (const o of fresh) seenPassed.current.add(o.scenario_id);
            const preferred = missionId
              ? [...fresh.filter((o) => o.scenario_id === missionId), ...fresh.filter((o) => o.scenario_id !== missionId)]
              : fresh;
            setToast(preferred);
          }
        })
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [ready, missionId, targetId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMissionOpen(false);
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        nav(observeUrl(targetId));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, targetId]);

  const send = useCallback(
    (message: string) => {
      if (!ready || busy) return;
      setMessages((m) => [...m, { role: "user", content: message }]);
      setBusy(true);
      api
        .chat(targetId, message)
        .then((r) => setMessages((m) => [...m, { role: "assistant", content: r.reply }]))
        .catch((e) => setMessages((m) => [...m, { role: "assistant", content: `[error] ${e.message}` }]))
        .finally(() => setBusy(false));
    },
    [ready, busy, targetId]
  );

  const resetWorld = () => {
    if (!confirm(`把 ${product.brand} 恢复成初始种子？对话、轨迹和外发都会清空。`)) return;
    api
      .resetWorld(targetId, missionId || null)
      .then((w) => {
        setMessages(w.messages ?? []);
        setAppliedDefenses(new Set(w.enabled_defenses));
        setObservations([]);
        setToast([]);
        setSimState({});
        seenPassed.current = new Set();
      })
      .catch((e) => setWorldError(e instanceof Error ? e.message : String(e)));
  };

  const Sim = SIMS[targetId] ?? SIMS.__placeholder;
  const missionObs = observations.find((o) => o.scenario_id === missionId);

  return (
    <div className="h-screen flex flex-col bg-slate-100" style={{ colorScheme: "light" }}>
      <header className="h-10 shrink-0 border-b border-slate-800 bg-[#111827] text-slate-200 px-3 flex items-center gap-2.5">
        <Link
          to="/"
          className="flex items-center gap-1.5 font-mono text-accent font-bold text-[13px] hover:text-accent/80"
          title="返回靶场"
        >
          <Icon name="arrow-left" size={13} />
          ASL
        </Link>
        <AppNav active="range" compact />
        <span className="text-dim text-xs font-mono">/</span>
        <span className="text-[13px] font-semibold truncate">{product.brand}</span>
        <span className="flex-1" />

        {scenario && (
          <div className="relative">
            <button
              onClick={() => setMissionOpen((v) => !v)}
              className={`chip ${missionObs?.passed ? "text-ok border-ok/50" : "text-warn border-warn/40"}`}
            >
              <Icon name="target" size={10} />
              <span className="max-w-[12rem] truncate">{scenario.title}</span>
              {missionObs && (
                <span>
                  {missionObs.passed_count}/{missionObs.total}
                </span>
              )}
            </button>
            {missionOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 panel p-3 shadow-pop z-40">
                <div className="text-[12px] text-slate-300 leading-relaxed">
                  当前课程挂在顶栏。简报和解析在教学页。
                </div>
                {missionObs && (
                  <div className="mt-2 text-[11px] font-mono text-dim">
                    副作用 {missionObs.passed_count}/{missionObs.total}
                    {missionObs.passed ? " · 已成立" : ""}
                  </div>
                )}
                <Link
                  to={`/learn/${scenario.id}`}
                  className="btn w-full mt-2 text-[12px] py-1"
                  onClick={() => setMissionOpen(false)}
                >
                  <Icon name="book-open" size={12} />
                  打开课程
                </Link>
              </div>
            )}
          </div>
        )}

        {isMock && (
          <span
            className="chip text-warn border-warn/50"
            title={
              missionId
                ? "助手按本课标准答案行动。配置 API Key 后重启，即可与真实模型对抗。"
                : "离线占位：助手作简短回复。带着课程进入可回放标准答案；配置 API Key 后可真实对话。"
            }
          >
            <Icon name="alert-triangle" size={10} />
            {missionId ? "回放本课" : "离线占位"}
          </span>
        )}
        {appliedDefenses.size > 0 && (
          <Link to={observeUrl(targetId)} className="chip text-ok border-ok/50" title="在观测页管理防护">
            <Icon name="shield-check" size={10} />
            防护 × {appliedDefenses.size}
          </Link>
        )}
        {meta && <LlmBadge mode={meta.llm_mode} model={meta.llm_model} />}
        <button onClick={resetWorld} className="chip hover:text-slate-100" title="恢复成种子数据">
          <Icon name="refresh" size={10} />
          重置
        </button>
        <Link
          to={observeUrl(targetId)}
          className="chip hover:text-slate-100"
          title="调查台：工具调用、外发数据、防护 (Ctrl+`)"
        >
          <Icon name="activity" size={10} />
          观测
        </Link>
      </header>

      <div className="flex-1 min-h-0">
        {ready ? (
          <Sim sessionId={targetId} simState={simState} messages={messages} onSend={send} busy={busy} />
        ) : worldError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500 px-6 text-center">
            <div className="text-sm text-red-600">无法打开产品</div>
            <p className="text-[13px] max-w-md leading-relaxed">{worldError}</p>
            <Link
              to="/"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              返回靶场
            </Link>
          </div>
        ) : targetReady && !target ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="text-sm">未知产品 {targetId}</div>
            <Link
              to="/"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              返回靶场
            </Link>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            正在打开 {product.brand}…
          </div>
        )}
      </div>

      {toast.length > 0 && <CaptureToast items={toast} targetId={targetId} onClose={() => setToast([])} />}
    </div>
  );
}

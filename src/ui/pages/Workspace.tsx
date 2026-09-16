"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { observeUrl, productOf } from "../catalog";
import { LlmBadge } from "../components/Badge";
import { CaptureToast } from "../components/CaptureToast";
import { Icon } from "../components/Icon";
import { AppNav } from "../components/Shell";
import { SIMS } from "../sims";
import type { ChatMessage, Meta, Observation, Scenario, TargetInfo } from "../types";
import { assertionLabel } from "../types";
import { useParam } from "../useParam";

export function Workspace() {
  const targetId = useParam("targetId");
  const params = useSearchParams();
  const nav = useRouter();
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
  const passedPrimed = useRef(false);
  const busyRef = useRef(false);

  const product = productOf(targetId);

  useEffect(() => {
    document.title = `${product.brand} · ASL`;
    api
      .meta()
      .then(setMeta)
      .catch(() => {});
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
    passedPrimed.current = false;
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
      if (document.hidden) return; // 后台标签页不打接口，回前台下一拍即恢复
      api
        .sim(targetId)
        .then(setSimState)
        .catch(() => {});
      api
        .listWorlds()
        .then((list) => {
          const w = list.find((x) => x.target_id === targetId);
          if (w) setAppliedDefenses(new Set(w.enabled_defenses));
        })
        .catch(() => {});
      // 离开页面期间跑完的轮次，回来自动补上；发送中的乐观消息由 send 自己管
      api
        .chatMessages(targetId)
        .then((w) => {
          if (!busyRef.current) setMessages(w.messages ?? []);
        })
        .catch(() => {});
      api
        .observations(targetId)
        .then((body) => {
          setObservations(body.observations);
          const passedNow = body.observations.filter((o) => o.passed);
          if (!passedPrimed.current) {
            // 进页时已经达成的不算新达成（复测/重进不弹），只弹本页会话里的「从未过到过」
            passedPrimed.current = true;
            for (const o of passedNow) seenPassed.current.add(o.scenario_id);
            return;
          }
          const fresh = passedNow.filter((o) => !seenPassed.current.has(o.scenario_id));
          if (fresh.length) {
            for (const o of fresh) seenPassed.current.add(o.scenario_id);
            const preferred = missionId
              ? [
                  ...fresh.filter((o) => o.scenario_id === missionId),
                  ...fresh.filter((o) => o.scenario_id !== missionId),
                ]
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
        nav.push(observeUrl(targetId));
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
      busyRef.current = true;
      api
        .chat(targetId, message)
        // 以服务端为准回填（轮询同步同一来源，避免双写重复）
        .then(() => api.chatMessages(targetId))
        .then((w) => setMessages(w.messages ?? []))
        .catch((e) => setMessages((m) => [...m, { role: "assistant", content: `[error] ${e.message}` }]))
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
        });
    },
    [ready, busy, targetId],
  );

  const act = useCallback(
    async (action: string, args: Record<string, unknown>) => {
      if (!ready) return;
      await api.act(targetId, action, args);
      const state = await api.sim(targetId);
      setSimState(state);
    },
    [ready, targetId],
  );

  const resetChat = useCallback(() => {
    if (!ready || busy) return;
    const prev = messages;
    if (prev.length === 0) return;
    setMessages([]);
    api
      .clearChat(targetId)
      .then((w) => setMessages(w.messages ?? []))
      .catch(() => setMessages(prev));
  }, [ready, busy, targetId, messages]);

  const resetWorld = () => {
    if (!confirm(`把 ${product.brand} 恢复成初始数据？对话、操作记录、外发，以及这个产品相关课程的完成状态都会清空。`))
      return;
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
  const missionChecks = missionObs?.checks?.length
    ? missionObs.checks
    : (scenario?.assertions ?? []).map((a) => ({
        label: assertionLabel(a) || "判据",
        passed: false,
      }));

  return (
    <div className="h-screen flex flex-col bg-slate-100" style={{ colorScheme: "light" }}>
      <header className="h-10 shrink-0 border-b border-slate-800 bg-[#111827] text-slate-200 px-3 flex items-center gap-2.5">
        <Link
          href="/"
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
              type="button"
              onClick={() => setMissionOpen((v) => !v)}
              className={`chip ${missionObs?.passed ? "text-ok border-ok/50" : "text-warn border-warn/40"}`}
            >
              <Icon name="target" size={10} />
              <span className="max-w-[12rem] truncate">{scenario.title}</span>
              {missionObs?.passed ? (
                <span>已打成</span>
              ) : missionObs && missionObs.total > 0 ? (
                <span>
                  {missionObs.passed_count}/{missionObs.total}
                </span>
              ) : null}
            </button>
            {missionOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 panel p-3 shadow-pop z-40">
                <div className="text-[12px] text-slate-300 leading-relaxed">当前课程在顶栏。原理和实战在教学页。</div>
                {missionChecks.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {missionChecks.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
                        {c.passed ? (
                          <Icon name="check" size={11} className="mt-1 text-ok shrink-0" />
                        ) : (
                          <span className="mt-[6px] h-[5px] w-[5px] rounded-full border border-dim shrink-0" />
                        )}
                        <span className={c.passed ? "text-ok" : "text-slate-300"}>{c.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {missionObs && missionChecks.length === 0 && (
                  <div className="mt-2 text-[11px] text-dim">
                    {missionObs.passed ? "观测里已经能看到危害" : "外发和工具结果会出现在观测页"}
                  </div>
                )}
                <Link
                  href={`/learn/${scenario.id}`}
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

        {appliedDefenses.size > 0 && (
          <Link href={observeUrl(targetId)} className="chip text-ok border-ok/50" title="在观测页管理防护">
            <Icon name="shield-check" size={10} />
            防护 {appliedDefenses.size}
          </Link>
        )}
        {meta && <LlmBadge model={meta.llm_model} />}
        <button type="button" onClick={resetWorld} className="chip hover:text-slate-100" title="恢复成初始数据">
          <Icon name="refresh" size={10} />
          重置
        </button>
        <Link
          href={observeUrl(targetId)}
          className="chip hover:text-slate-100"
          title="观测：操作记录、外发、防护 (Ctrl+`)"
        >
          <Icon name="activity" size={10} />
          观测
        </Link>
      </header>

      <div className="flex-1 min-h-0">
        {ready ? (
          <Sim simState={simState} messages={messages} onSend={send} onAct={act} onResetChat={resetChat} busy={busy} />
        ) : worldError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500 px-6 text-center">
            <div className="text-sm text-red-600">无法打开产品</div>
            <p className="text-[13px] max-w-md leading-relaxed">{worldError}</p>
            <Link
              href="/"
              className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              返回靶场
            </Link>
          </div>
        ) : targetReady && !target ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-500">
            <div className="text-sm">未知产品 {targetId}</div>
            <Link
              href="/"
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

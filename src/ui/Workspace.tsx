"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { observeUrl, productOf } from "./catalog";
import { LlmBadge } from "./components/Badge";
import { CaptureToast } from "./components/CaptureToast";
import { Icon } from "./components/Icon";
import { AppNav } from "./components/Shell";
import { SIMS } from "./sims";
import type { ChatMessage, Meta, Observation, Scenario } from "./types";
import { assertionLabel } from "./types";

export function Workspace({
  targetId,
  missionId,
  scenario,
  meta,
}: {
  targetId: string;
  missionId: string;
  scenario: Scenario | null;
  meta: Meta;
}) {
  const nav = useRouter();

  const [ready, setReady] = useState(false);
  const [appliedDefenses, setAppliedDefenses] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [simState, setSimState] = useState<Record<string, unknown>>({});
  const [observations, setObservations] = useState<Observation[]>([]);
  const [missionOpen, setMissionOpen] = useState(false);
  const [toast, setToast] = useState<Observation[]>([]);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [extOpen, setExtOpen] = useState(false);
  const [extFrom, setExtFrom] = useState("");
  const [extSubject, setExtSubject] = useState("");
  const [extBody, setExtBody] = useState("");
  const [extBusy, setExtBusy] = useState(false);
  const [extErr, setExtErr] = useState<string | null>(null);
  const seenPassed = useRef<Set<string>>(new Set());
  const passedPrimed = useRef(false);
  const busyRef = useRef(false);

  const product = productOf(targetId);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
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
      if (document.hidden) return;
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
      const result = await api.act(targetId, action, args);
      const state = await api.sim(targetId);
      setSimState(state);
      return result;
    },
    [ready, targetId],
  );

  const deliverExtMail = useCallback(() => {
    setExtBusy(true);
    setExtErr(null);
    api
      .act(targetId, "import_email", { from: extFrom, subject: extSubject, body: extBody })
      .then(() => api.sim(targetId))
      .then((state) => {
        setSimState(state);
        setExtOpen(false);
        setExtFrom("");
        setExtSubject("");
        setExtBody("");
      })
      .catch((e) => setExtErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setExtBusy(false));
  }, [targetId, extFrom, extSubject, extBody]);

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
    if (!confirm(`将 ${product.brand} 恢复为初始数据？对话、调用记录、外发将被清除，通关进度仅清除当前课程。`)) return;
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
        label: assertionLabel(a) || "条件",
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
              <span>任务进度</span>
              {missionObs?.passed ? (
                <span>已通关</span>
              ) : missionObs && missionObs.total > 0 ? (
                <span>
                  {missionObs.passed_count}/{missionObs.total}
                </span>
              ) : null}
            </button>
            {missionOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 panel p-3 shadow-pop z-40">
                <div className="text-[12px] text-slate-300 leading-relaxed">当前关卡见顶栏，原理与答案见教学页。</div>
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
                    {missionObs.passed ? "观测页已记录相关结果" : "外发与工具结果将记录于观测页"}
                  </div>
                )}
                <Link
                  href={`/learn/${scenario.id}`}
                  className="btn w-full mt-2 text-[12px] py-1"
                  onClick={() => setMissionOpen(false)}
                >
                  <Icon name="book-open" size={12} />
                  查看课程
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
        {targetId === "mail_agent" && (
          <button
            type="button"
            className="chip hover:text-slate-100"
            title="以任意发件人身份向本收件箱投递一封邮件（模拟外部来信，攻击者视角）"
            onClick={() => setExtOpen(true)}
          >
            <Icon name="external-link" size={10} />
            外部来信
          </button>
        )}
        <LlmBadge model={meta.llm_model} />
        <button
          type="button"
          onClick={resetWorld}
          className="chip hover:text-slate-100"
          title="清除本产品数据及相关通关进度"
        >
          <Icon name="refresh" size={10} />
          重置
        </button>
        <button
          type="button"
          className="chip hover:text-slate-100"
          title="将全部产品与通关进度恢复为初始状态"
          onClick={() => {
            if (!confirm("将全部产品与通关进度恢复为初始状态？")) return;
            api.resetAll().then(() => {
              window.location.href = "/";
            });
          }}
        >
          全部重置
        </button>
        <Link
          href={observeUrl(targetId)}
          className="chip hover:text-slate-100"
          title="观测：调用记录、外发、防护 (Ctrl+`)"
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
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 text-sm">
            正在打开 {product.brand}…
          </div>
        )}
      </div>

      {targetId === "mail_agent" && extOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-pop p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-slate-900">外部来信（攻击者投递）</div>
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setExtOpen(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <p className="text-[12px] leading-relaxed text-slate-500">
              以任意发件人身份向本收件箱投递一封邮件。现实中这封信从攻击者自己的服务器发出，落进受害者邮箱时与普通来信毫无区别。
            </p>
            <label className="block text-[12px] text-slate-500">
              发件人
              <input
                value={extFrom}
                onChange={(e) => setExtFrom(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800"
                placeholder="name@example.com"
              />
            </label>
            <label className="block text-[12px] text-slate-500">
              主题
              <input
                value={extSubject}
                onChange={(e) => setExtSubject(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800"
              />
            </label>
            <label className="block text-[12px] text-slate-500">
              正文
              <textarea
                value={extBody}
                onChange={(e) => setExtBody(e.target.value)}
                rows={8}
                className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800 font-mono"
              />
            </label>
            {extErr && <div className="text-[12px] text-red-600">{extErr}</div>}
            <button
              type="button"
              disabled={extBusy || !extFrom.trim() || !extSubject.trim()}
              onClick={deliverExtMail}
              className="w-full rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[13px] py-2"
            >
              {extBusy ? "投递中…" : "投递到收件箱"}
            </button>
          </div>
        </div>
      )}

      {toast.length > 0 && <CaptureToast items={toast} targetId={targetId} onClose={() => setToast([])} />}
    </div>
  );
}

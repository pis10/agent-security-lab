"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, errorText } from "./api";
import { productOf } from "./catalog";
import { ModelBadge, Tag, TierBadge } from "./components/Badge";
import { CaptureToast } from "./components/CaptureToast";
import { ExternalMailDialog } from "./components/ExternalMailDialog";
import { Icon } from "./components/Icon";
import { ObservePanel, type ObserveTab } from "./components/ObservePanel";
import { BrandMark } from "./components/Shell";
import { TaskPanel } from "./components/TaskPanel";
import { UserMenu } from "./components/UserMenu";
import { useSessionUser } from "./session";
import { SIMS } from "./sims";
import {
  type ChatMessage,
  LLM_NOT_CONFIGURED,
  type Meta,
  type Observation,
  type Scenario,
  type SinkEvent,
  type TargetInfo,
  type TraceEvent,
} from "./types";

type RunStatus = "idle" | "queued" | "running";

const WIDE = "(min-width: 1024px)";
// 两侧面板同时展开时，产品区至少要留出这么宽，否则打开一侧就收起另一侧
const ROOMY = "(min-width: 1600px)";
const roomy = () => window.matchMedia(ROOMY).matches;

function RunChip({ status }: { status: RunStatus }) {
  if (status === "idle") return null;
  return status === "queued" ? (
    <Tag tone="warn" icon="clock" title="前面的对话结束后会自动开始，请勿重复发送">
      排队中
    </Tag>
  ) : (
    <span className="tag border-info/25 bg-info-soft text-info">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-info" aria-hidden />
      助手处理中
    </span>
  );
}

/**打不开产品：未配置模型时按身份给出下一步，其他错误原样展示。 */
function WorldError({ error, isAdmin }: { error: { message: string; code: string }; isAdmin: boolean }) {
  const missing = error.code === LLM_NOT_CONFIGURED;
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="card max-w-md w-full p-6 text-center">
        <span
          className={`mx-auto h-11 w-11 rounded-xl flex items-center justify-center ${
            missing ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger"
          }`}
        >
          <Icon name="alert-triangle" size={20} />
        </span>
        <h2 className="mt-3 text-[16px] font-semibold text-ink">{missing ? "尚未配置模型" : "无法打开产品"}</h2>
        <p className="mt-1.5 text-[13px] text-ink-2 leading-relaxed">
          {missing
            ? isAdmin
              ? `${error.message}。配置并测试连接后刷新本页即可开始，任务卡可以先看。`
              : "管理员还没有配置模型，助手暂时无法回复。请联系管理员，任务卡可以先看。"
            : error.message}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          {missing && isAdmin && (
            <Link href="/admin/model" className="btn-primary">
              去配置模型
            </Link>
          )}
          <Link href="/" className="btn">
            返回学习
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Workspace({
  target,
  missionId,
  scenario,
  meta,
  missions,
}: {
  target: TargetInfo;
  missionId: string;
  scenario: Scenario | null;
  meta: Meta;
  missions: Scenario[];
}) {
  const targetId = target.id;
  const user = useSessionUser();
  const product = productOf(targetId);

  const [ready, setReady] = useState(false);
  const [worldError, setWorldError] = useState<{ message: string; code: string } | null>(null);
  const [defenses, setDefenses] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [simState, setSimState] = useState<Record<string, unknown>>({});
  const [observations, setObservations] = useState<Observation[]>([]);
  const [toast, setToast] = useState<Observation[]>([]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [observeOpen, setObserveOpen] = useState(false);
  const [observeTab, setObserveTab] = useState<ObserveTab>("timeline");
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [sink, setSink] = useState<SinkEvent[]>([]);
  const [defenseNote, setDefenseNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extOpen, setExtOpen] = useState(false);
  const [wide, setWide] = useState(true);
  const seenPassed = useRef<Set<string>>(new Set());
  const passedPrimed = useRef(false);
  const busyRef = useRef(false);

  // 宽屏默认展开任务卡；窄屏两侧都收起，按需以浮层打开
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    setWide(mq.matches);
    setTaskOpen(mq.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setWide(e.matches);
      if (!e.matches) {
        setTaskOpen(false);
        setObserveOpen(false);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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
        setDefenses(new Set(w.enabled_defenses));
        setMessages(w.messages ?? []);
        setRunStatus(w.run_status);
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setWorldError({ message: errorText(e), code: e instanceof ApiError ? e.code : "" });
      });
    return () => {
      cancelled = true;
    };
  }, [targetId, missionId]);

  const openObserve = useCallback((tab: ObserveTab) => {
    setObserveTab(tab);
    setObserveOpen(true);
    if (!roomy()) setTaskOpen(false);
  }, []);

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
          if (w) {
            setDefenses(new Set(w.enabled_defenses));
            setRunStatus(w.run_status);
          }
        })
        .catch(() => {});
      api
        .chatMessages(targetId)
        .then((w) => {
          if (!busyRef.current) setMessages(w.messages ?? []);
        })
        .catch(() => {});
      if (observeOpen) {
        api
          .trace(targetId)
          .then(setTrace)
          .catch(() => {});
        api
          .sink(targetId)
          .then(setSink)
          .catch(() => {});
      }
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
            setToast([
              ...fresh.filter((o) => o.scenario_id === missionId),
              ...fresh.filter((o) => o.scenario_id !== missionId),
            ]);
          }
        })
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [ready, missionId, targetId, observeOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setObserveOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useCallback(
    (message: string) => {
      if (!ready || busy || runStatus !== "idle") return;
      setMessages((m) => [...m, { role: "user", content: message }]);
      setBusy(true);
      setDefenseNote(null);
      busyRef.current = true;
      api
        .chat(targetId, message)
        .then(() => api.chatMessages(targetId))
        .then((w) => setMessages(w.messages ?? []))
        .catch((e) => setMessages((m) => [...m, { role: "assistant", content: `[error] ${errorText(e)}` }]))
        .finally(() => {
          busyRef.current = false;
          setBusy(false);
          setRunStatus("idle");
        });
    },
    [ready, busy, runStatus, targetId],
  );

  const act = useCallback(
    async (action: string, args: Record<string, unknown>) => {
      if (!ready) return;
      const result = await api.act(targetId, action, args);
      setSimState(await api.sim(targetId));
      return result;
    },
    [ready, targetId],
  );

  const resetChat = useCallback(() => {
    if (!ready || busy) return;
    const prev = messages;
    setMessages([]);
    setDefenseNote(null);
    api
      .clearChat(targetId)
      .then((w) => setMessages(w.messages ?? []))
      .catch((e) => {
        setMessages(prev);
        setNotice(errorText(e));
      });
  }, [ready, busy, targetId, messages]);

  const toggleDefense = (id: string) => {
    const next = new Set(defenses);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const prev = defenses;
    setDefenses(next);
    api
      .setDefenses(targetId, [...next])
      .then(() => setDefenseNote(messages.length > 0 ? "防护已更新。清空对话后再试，助手不会沿用之前的上下文。" : null))
      .catch((e) => {
        setDefenses(prev);
        setNotice(errorText(e));
      });
  };

  const resetWorld = () => {
    if (!confirm(`将 ${product.brand} 恢复为初始数据？对话、调用记录、外发将被清除，通关进度仅清除当前关卡。`)) return;
    api
      .resetWorld(targetId, missionId || null)
      .then((w) => {
        setMessages(w.messages ?? []);
        setDefenses(new Set(w.enabled_defenses));
        setObservations([]);
        setTrace([]);
        setSink([]);
        setToast([]);
        setSimState({});
        setDefenseNote(null);
        seenPassed.current = new Set();
      })
      .catch((e) => setNotice(errorText(e)));
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const Sim = SIMS[targetId] ?? SIMS.__placeholder;
  const missionObs = observations.find((o) => o.scenario_id === missionId);
  const working = busy || runStatus !== "idle";
  const overlay = "fixed top-14 bottom-0 z-40 w-[min(380px,100%)] bg-surface shadow-pop";

  return (
    <div className="h-dvh flex flex-col bg-paper text-ink">
      <header className="h-14 shrink-0 bg-surface border-b border-line px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
        <BrandMark compact />
        <nav aria-label="位置" className="hidden sm:flex items-center gap-1.5 min-w-0 text-[13px]">
          <Link href="/" className="text-muted hover:text-ink">
            学习
          </Link>
          <Icon name="chevron-right" size={13} className="text-line-strong shrink-0" />
          <span className="text-ink-2 truncate">{product.brand}</span>
          {scenario && (
            <>
              <Icon name="chevron-right" size={13} className="text-line-strong shrink-0" />
              <TierBadge tier={scenario.tier} size="sm" />
              <span className="font-medium text-ink truncate">{scenario.title}</span>
            </>
          )}
        </nav>
        <span className="flex-1" />
        <RunChip status={runStatus} />
        {missionObs?.passed && (
          <Tag tone="ok" icon="flag">
            已通关
          </Tag>
        )}
        <span className="hidden xl:inline-flex">
          <ModelBadge model={meta.llm_model} />
        </span>
        <button
          type="button"
          className={`btn btn-sm ${taskOpen ? "bg-sunken" : ""}`}
          aria-pressed={taskOpen}
          aria-label="任务卡"
          onClick={() => {
            if (!taskOpen && !roomy()) setObserveOpen(false);
            setTaskOpen(!taskOpen);
          }}
        >
          <Icon name="target" size={13} />
          <span className="hidden md:inline">任务</span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${observeOpen ? "bg-sunken" : ""}`}
          aria-pressed={observeOpen}
          aria-label="观测"
          title="观测：工具调用、外发与防护（Ctrl+`）"
          onClick={() => (observeOpen ? setObserveOpen(false) : openObserve(observeTab))}
        >
          <Icon name="activity" size={13} />
          <span className="hidden md:inline">观测</span>
          {defenses.size > 0 && (
            <span className="inline-flex items-center gap-0.5 text-ok">
              <Icon name="shield-check" size={12} />
              {defenses.size}
            </span>
          )}
        </button>
        {targetId === "mail_agent" && (
          <button
            type="button"
            className="btn btn-sm"
            title="以攻击者身份向收件箱投递邮件"
            aria-label="外部来信"
            onClick={() => setExtOpen(true)}
          >
            <Icon name="mail" size={13} />
            <span className="hidden md:inline">外部来信</span>
          </button>
        )}
        <button
          type="button"
          className="btn-ghost btn-sm"
          title="恢复本产品的初始数据"
          aria-label="重置产品"
          onClick={resetWorld}
        >
          <Icon name="refresh" size={13} />
          <span className="hidden lg:inline">重置</span>
        </button>
        <UserMenu />
      </header>

      <div className="flex-1 min-h-0 flex relative">
        {taskOpen && (
          <aside
            aria-label="任务卡"
            className={
              wide
                ? "w-[340px] shrink-0 border-r border-line bg-surface overflow-y-auto"
                : `${overlay} left-0 overflow-y-auto drawer-in`
            }
          >
            <TaskPanel
              scenario={scenario}
              observation={missionObs}
              missions={missions}
              targetId={targetId}
              defensesOn={defenses.size}
              onOpenObserve={openObserve}
            />
          </aside>
        )}

        <main className="flex-1 min-w-0 relative">
          {ready ? (
            <Sim
              simState={simState}
              messages={messages}
              onSend={send}
              onAct={act}
              onResetChat={resetChat}
              busy={working}
            />
          ) : worldError ? (
            <WorldError error={worldError} isAdmin={!!user?.is_admin} />
          ) : (
            <div className="h-full flex items-center justify-center text-muted text-[13px]">
              正在打开 {product.brand}…
            </div>
          )}
        </main>

        {observeOpen && (
          <aside
            aria-label="观测"
            className={wide ? "w-[420px] shrink-0 border-l border-line bg-surface" : `${overlay} right-0 drawer-in`}
          >
            <ObservePanel
              targetId={targetId}
              tab={observeTab}
              onTab={setObserveTab}
              trace={trace}
              sink={sink}
              defenses={target.defenses}
              enabled={defenses}
              onToggleDefense={toggleDefense}
              defenseNote={defenseNote}
              onClearChat={resetChat}
              busy={working}
              onClose={() => setObserveOpen(false)}
            />
          </aside>
        )}

        {!wide && (taskOpen || observeOpen) && (
          <button
            type="button"
            aria-label="关闭浮层"
            className="fixed inset-0 top-14 z-30 bg-ink/20"
            onClick={() => {
              setTaskOpen(false);
              setObserveOpen(false);
            }}
          />
        )}
      </div>

      {notice && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 card border-danger/30 shadow-pop px-4 py-2.5 text-[13px] text-danger rise-in"
        >
          {notice}
        </div>
      )}

      {extOpen && (
        <ExternalMailDialog
          onClose={() => setExtOpen(false)}
          onDeliver={async (mail) => {
            await api.act(targetId, "import_email", mail);
            setSimState(await api.sim(targetId));
          }}
        />
      )}

      {toast.length > 0 && (
        <CaptureToast
          items={toast}
          onObserve={() => {
            setToast([]);
            openObserve("timeline");
          }}
          onClose={() => setToast([])}
        />
      )}
    </div>
  );
}

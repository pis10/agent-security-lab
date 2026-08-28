import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { TierBadge } from "../components/Badge";
import { DefenseToggles } from "../components/DefenseToggles";
import { FlagBanner } from "../components/FlagBanner";
import { ObjectiveList } from "../components/ObjectiveList";
import { SinkInbox } from "../components/SinkInbox";
import { TraceConsole } from "../components/TraceConsole";
import { SIMS } from "../sims";
import type {
  ChatMessage,
  CheckResult,
  Scenario,
  SinkEvent,
  TargetInfo,
  TraceEvent,
} from "../types";

export function Workspace() {
  const { targetId = "", scenarioId = "" } = useParams();
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [defenses, setDefenses] = useState<Set<string>>(new Set());
  const [appliedDefenses, setAppliedDefenses] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [simState, setSimState] = useState<Record<string, any>>({});
  const [sink, setSink] = useState<SinkEvent[]>([]);
  const [check, setCheck] = useState<CheckResult | null>(null);
  const [banner, setBanner] = useState(false);
  const [rightTab, setRightTab] = useState<"trace" | "loot">("trace");
  const seenPassed = useRef(false);

  // session lifecycle per route
  useEffect(() => {
    let sid: string | null = null;
    let cancelled = false;
    Promise.all([api.targets(), api.scenarios()]).then(([targets, scenarios]) => {
      setTarget(targets.find((t) => t.id === targetId) ?? null);
      setScenario(scenarios.find((s) => s.id === scenarioId) ?? null);
    });
    setMessages([]);
    setCheck(null);
    setBanner(false);
    seenPassed.current = false;
    api
      .createSession(targetId, scenarioId, [])
      .then((r) => {
        if (!cancelled) {
          sid = r.session_id;
          setSessionId(r.session_id);
          setDefenses(new Set());
          setAppliedDefenses(new Set());
        }
      })
      .catch((e) => setMessages([{ role: "assistant", content: `[会话创建失败] ${e.message}` }]));
    return () => {
      cancelled = true;
      if (sid) api.closeSession(sid).catch(() => {});
    };
  }, [targetId, scenarioId]);

  // polling: trace + sim + sink + objectives
  useEffect(() => {
    if (!sessionId || !scenarioId) return;
    const tick = () => {
      api.trace(sessionId).then(setTrace).catch(() => {});
      api.sim(sessionId).then(setSimState).catch(() => {});
      api.sink(sessionId).then(setSink).catch(() => {});
      api
        .check(sessionId, scenarioId)
        .then((c) => {
          setCheck(c);
          if (c.passed && !seenPassed.current) {
            seenPassed.current = true;
            setBanner(true);
          }
        })
        .catch(() => {});
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [sessionId, scenarioId]);

  const send = useCallback(
    (message: string) => {
      if (!sessionId || busy) return;
      setMessages((m) => [...m, { role: "user", content: message }]);
      setBusy(true);
      api
        .chat(sessionId, message)
        .then((r) => setMessages((m) => [...m, { role: "assistant", content: r.reply }]))
        .catch((e) => setMessages((m) => [...m, { role: "assistant", content: `[error] ${e.message}` }]))
        .finally(() => setBusy(false));
    },
    [sessionId, busy]
  );

  const toggleDefense = (id: string) =>
    setDefenses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyDefenses = async () => {
    if (sessionId) await api.closeSession(sessionId).catch(() => {});
    const r = await api.createSession(targetId, scenarioId, [...defenses]);
    setSessionId(r.session_id);
    setAppliedDefenses(new Set(defenses));
    setMessages([]);
    setCheck(null);
    setTrace([]);
    setSink([]);
    setBanner(false);
    seenPassed.current = false;
  };

  const defensesDirty =
    [...defenses].sort().join(",") !== [...appliedDefenses].sort().join(",");

  const Sim = SIMS[targetId] ?? SIMS.__placeholder;

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-edge bg-panel px-4 py-2 flex items-center gap-3 shrink-0">
        <Link to="/" className="font-mono text-accent font-bold">ASL</Link>
        <span className="text-dim text-xs font-mono">/</span>
        {scenario && (
          <>
            <TierBadge tier={scenario.tier} />
            <span className="font-semibold text-sm">{scenario.title}</span>
          </>
        )}
        <span className="flex-1" />
        {appliedDefenses.size > 0 && (
          <span className="chip text-ok border-ok/50">防护 × {appliedDefenses.size}</span>
        )}
        {sessionId && <span className="chip">session {sessionId.slice(0, 8)}</span>}
      </header>

      <div className="flex-1 flex min-h-0">
        {/* left: mission */}
        <aside className="w-80 shrink-0 border-r border-edge bg-panel overflow-y-auto console-scroll p-4 space-y-4">
          <div>
            <div className="panel-title mb-2">// 任务简报</div>
            <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{scenario?.briefing}</p>
          </div>

          <div>
            <div className="panel-title mb-2">// 目标（实时判定）</div>
            <ObjectiveList check={check} />
          </div>

          <div>
            <div className="panel-title mb-2">// 防护开关（复测闭环）</div>
            <DefenseToggles
              defenses={target?.defenses ?? []}
              selected={defenses}
              onToggle={toggleDefense}
              dirty={defensesDirty}
              onApply={applyDefenses}
            />
          </div>

          {(scenario?.hints.length ?? 0) > 0 && (
            <details>
              <summary className="panel-title cursor-pointer">// 提示 ×{scenario!.hints.length}</summary>
              <ul className="mt-2 space-y-1 text-[13px] text-slate-400 list-disc pl-4">
                {scenario!.hints.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </details>
          )}

          {check?.passed && (
            <div className="space-y-2">
              <a
                className="btn-ok block text-center"
                href={api.reportUrl(sessionId!, scenarioId)}
                target="_blank"
                rel="noreferrer"
              >
                导出通关报告
              </a>
              {scenario?.writeup && (
                <details className="panel p-3">
                  <summary className="text-ok text-sm cursor-pointer">通关解析（writeup）</summary>
                  <p className="mt-2 text-[13px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                    {scenario.writeup}
                  </p>
                </details>
              )}
              {scenario?.fix_notes && (
                <details className="panel p-3">
                  <summary className="text-ok text-sm cursor-pointer">防守对照</summary>
                  <p className="mt-2 text-[13px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                    {scenario.fix_notes}
                  </p>
                </details>
              )}
            </div>
          )}
        </aside>

        {/* center: simulated product */}
        <main className="flex-1 min-w-0 bg-base">
          {sessionId ? (
            <Sim sessionId={sessionId} simState={simState} messages={messages} onSend={send} busy={busy} />
          ) : (
            <div className="h-full flex items-center justify-center text-dim font-mono text-sm">
              正在建立会话<span className="cursor-blink">▌</span>
            </div>
          )}
        </main>

        {/* right: attack monitor */}
        <aside className="w-96 shrink-0 border-l border-edge bg-panel flex flex-col min-h-0">
          <div className="flex border-b border-edge shrink-0">
            {(
              [
                ["trace", "攻击链监控"],
                ["loot", `攻击者收件箱${sink.length ? ` (${sink.length})` : ""}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setRightTab(id)}
                className={`flex-1 py-2 text-xs font-mono transition-colors ${
                  rightTab === id ? "text-slate-100 border-b-2 border-accent" : "text-dim hover:text-slate-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {rightTab === "trace" ? <TraceConsole events={trace} /> : <SinkInbox events={sink} />}
          </div>
        </aside>
      </div>

      {banner && (
        <FlagBanner
          onClose={() => setBanner(false)}
          onReport={() => window.open(api.reportUrl(sessionId!, scenarioId), "_blank")}
        />
      )}
    </div>
  );
}

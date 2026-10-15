"use client";
import Link from "next/link";
import { observeUrl } from "../catalog";
import type { DefenseInfo, SinkEvent, TraceEvent } from "../types";
import { DefenseToggles } from "./DefenseToggles";
import { EventTimeline } from "./EventTimeline";
import { Icon } from "./Icon";
import { SinkInbox } from "./SinkInbox";

export type ObserveTab = "timeline" | "sink" | "defenses";

/**工作台右侧的观测抽屉：时间线、外发箱、防护开关，不必离开产品页。 */
export function ObservePanel({
  targetId,
  tab,
  onTab,
  trace,
  sink,
  defenses,
  enabled,
  onToggleDefense,
  defenseNote,
  onClearChat,
  busy,
  onClose,
}: {
  targetId: string;
  tab: ObserveTab;
  onTab: (tab: ObserveTab) => void;
  trace: TraceEvent[];
  sink: SinkEvent[];
  defenses: DefenseInfo[];
  enabled: Set<string>;
  onToggleDefense: (id: string) => void;
  defenseNote: string | null;
  onClearChat: () => void;
  busy: boolean;
  onClose: () => void;
}) {
  const blocked = trace.filter((e) => e.kind === "policy_blocked").length;
  const tabs: { id: ObserveTab; label: string; count?: number; tone?: string }[] = [
    { id: "timeline", label: "时间线", count: trace.length },
    { id: "sink", label: "外发箱", count: sink.length, tone: sink.length ? "text-danger" : undefined },
    { id: "defenses", label: "防护", count: enabled.size, tone: enabled.size ? "text-ok" : undefined },
  ];
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="h-12 shrink-0 px-4 flex items-center gap-2 border-b border-line">
        <Icon name="activity" size={15} className="text-muted" />
        <span className="text-[14px] font-semibold text-ink flex-1">观测</span>
        {blocked > 0 && (
          <span className="text-[12px] text-warn inline-flex items-center gap-1">
            <Icon name="shield-alert" size={12} />
            拦截 {blocked} 次
          </span>
        )}
        <Link href={observeUrl(targetId)} className="btn-ghost btn-sm" title="打开完整观测页">
          <Icon name="external-link" size={13} />
        </Link>
        <button type="button" className="btn-ghost btn-sm" onClick={onClose} aria-label="关闭观测">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div role="tablist" aria-label="观测内容" className="shrink-0 px-3 pt-2 flex gap-1 border-b border-line">
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onTab(t.id)}
              className={`-mb-px h-9 px-3 inline-flex items-center gap-1.5 text-[13px] border-b-2 transition-colors ${
                on ? "border-ink text-ink font-medium" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
              {t.count ? <span className={`tabular-nums text-[12px] ${t.tone ?? "text-muted"}`}>{t.count}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "timeline" && <EventTimeline events={trace} />}
        {tab === "sink" && <SinkInbox events={sink} />}
        {tab === "defenses" && (
          <div className="h-full overflow-y-auto p-4 space-y-4">
            <p className="text-[12px] text-muted leading-relaxed">
              开关立即生效，不清除产品数据，通关记录也会保留。改完后清空对话再试，避免助手沿用之前的上下文。
            </p>
            <DefenseToggles defenses={defenses} selected={enabled} onToggle={onToggleDefense} disabled={busy} />
            {defenseNote && (
              <div className="rounded-lg border border-info/25 bg-info-soft px-3 py-2.5 text-[12px] text-info flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-0">{defenseNote}</span>
                <button type="button" className="btn btn-sm" onClick={onClearChat} disabled={busy}>
                  清空对话
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

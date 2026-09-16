import { useEffect, useRef, useState } from "react";
import type { TraceEvent } from "../types";
import { Icon } from "./Icon";

const KIND_META: Record<
  string,
  { label: string; icon: string; dot: string; chip: string }
> = {
  user_msg: {
    label: "你",
    icon: "user",
    dot: "bg-sky-500",
    chip: "bg-sky-50 text-sky-700 border-sky-200",
  },
  model_msg: {
    label: "助手",
    icon: "bot",
    dot: "bg-violet-500",
    chip: "bg-violet-50 text-violet-700 border-violet-200",
  },
  tool_call: {
    label: "调用",
    icon: "zap",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
  },
  tool_result: {
    label: "结果",
    icon: "arrow-left",
    dot: "bg-slate-400",
    chip: "bg-slate-50 text-slate-600 border-slate-200",
  },
  policy_blocked: {
    label: "阻断",
    icon: "shield-alert",
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-700 border-red-200",
  },
  note: {
    label: "系统",
    icon: "info",
    dot: "bg-slate-400",
    chip: "bg-slate-50 text-slate-600 border-slate-200",
  },
};

const FILTERS: { id: string; label: string; kinds: string[] }[] = [
  { id: "all", label: "全部", kinds: [] },
  { id: "io", label: "对话", kinds: ["user_msg", "model_msg"] },
  { id: "tools", label: "工具", kinds: ["tool_call", "tool_result"] },
  { id: "blocked", label: "阻断", kinds: ["policy_blocked"] },
];

function headline(ev: TraceEvent): string {
  const d = ev.data;
  switch (ev.kind) {
    case "user_msg":
      return String(d.content ?? "");
    case "model_msg": {
      const calls = (d.tool_calls ?? []).map((t: { name: string }) => t.name).join(", ");
      const text = String(d.content ?? "").trim();
      if (text && calls) return `${text}\n决定调用 ${calls}`;
      if (calls) return `决定调用 ${calls}`;
      return text || "（空回复）";
    }
    case "tool_call":
      return `${d.name}(${JSON.stringify(d.arguments ?? {})})`;
    case "tool_result":
      return String(d.result ?? "");
    case "policy_blocked":
      return `防护 ${d.defense} 拦截 ${d.tool}${d.detail ? `：${d.detail}` : ""}`;
    default:
      return JSON.stringify(d);
  }
}

const timeOf = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("zh-CN", { hour12: false });

export function EventTimeline({ events }: { events: TraceEvent[] }) {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const shown = events.filter((e) => {
    const f = FILTERS.find((x) => x.id === filter)!;
    return f.kinds.length === 0 || f.kinds.includes(e.kind);
  });

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight });
  }, [events.length, filter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-1 px-4 pt-3 pb-2 shrink-0">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2.5 py-1 rounded-md text-[12px] transition-colors ${
              filter === f.id
                ? "bg-slate-900 text-white"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div ref={boxRef} className="product-scroll flex-1 overflow-y-auto px-4 pb-4">
        {shown.length === 0 && (
          <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-center text-slate-400">
            <Icon name="activity" size={20} className="mb-2 text-slate-300" />
            <div className="text-[13px]">助手调用工具后，步骤会按时间列在这里</div>
          </div>
        )}
        <ol>
          {shown.map((ev, i) => {
            const meta = KIND_META[ev.kind] ?? KIND_META.note;
            const text = headline(ev);
            const long = text.length > 280;
            const expanded = open === i;
            const body = long && !expanded ? `${text.slice(0, 280)}…` : text;
            return (
              <li key={`${ev.ts}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center w-4 shrink-0">
                  <div className={`h-2.5 w-2.5 rounded-full mt-2 ${meta.dot}`} />
                  {i < shown.length - 1 && <div className="w-px flex-1 bg-slate-200 my-1" />}
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] ${meta.chip}`}
                    >
                      <Icon name={meta.icon} size={11} />
                      {meta.label}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{timeOf(ev.ts)}</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-[13px] leading-relaxed text-slate-700 font-mono">
                    {body}
                  </pre>
                  {long && (
                    <button
                      onClick={() => setOpen(expanded ? null : i)}
                      className="mt-1 text-[12px] text-slate-500 hover:text-slate-800"
                    >
                      {expanded ? "收起" : "展开全部"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

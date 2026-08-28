import { useEffect, useRef, useState } from "react";
import type { TraceEvent } from "../types";

const KIND_META: Record<string, { label: string; cls: string }> = {
  user_msg: { label: "输入", cls: "border-info text-info" },
  model_msg: { label: "决策", cls: "border-ok text-ok" },
  tool_call: { label: "调用", cls: "border-warn text-warn" },
  tool_result: { label: "结果", cls: "border-edge text-dim" },
  policy_blocked: { label: "阻断", cls: "border-accent text-accent" },
  note: { label: "系统", cls: "border-edge text-dim" },
};

const FILTERS: { id: string; label: string; kinds: string[] }[] = [
  { id: "all", label: "全部", kinds: [] },
  { id: "io", label: "输入/决策", kinds: ["user_msg", "model_msg"] },
  { id: "tools", label: "工具", kinds: ["tool_call", "tool_result"] },
  { id: "blocked", label: "阻断", kinds: ["policy_blocked"] },
];

function bodyOf(ev: TraceEvent): string {
  const d = ev.data;
  switch (ev.kind) {
    case "user_msg":
      return d.content ?? "";
    case "model_msg": {
      const calls = (d.tool_calls ?? []).map((t: any) => t.name).join(", ");
      return `${d.content ?? ""}${calls ? `\n→ 决定调用: ${calls}` : ""}`.trim() || "(空)";
    }
    case "tool_call":
      return `${d.name}(${JSON.stringify(d.arguments)})`;
    case "tool_result":
      return String(d.result ?? "").slice(0, 400);
    case "policy_blocked":
      return `防护 ${d.defense} 拦截 ${d.tool}: ${d.detail ?? ""}`;
    default:
      return JSON.stringify(d);
  }
}

export function TraceConsole({ events }: { events: TraceEvent[] }) {
  const [filter, setFilter] = useState("all");
  const boxRef = useRef<HTMLDivElement>(null);
  const shown = events.filter((e) => {
    const f = FILTERS.find((f) => f.id === filter)!;
    return f.kinds.length === 0 || f.kinds.includes(e.kind);
  });

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [events.length, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-3 pt-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
              filter === f.id ? "bg-elevated text-slate-100 border border-edge" : "text-dim hover:text-slate-300"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div ref={boxRef} className="console-scroll flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px]">
        {shown.length === 0 && <div className="text-dim">// 等待攻击动作…</div>}
        {shown.map((ev, i) => {
          const meta = KIND_META[ev.kind] ?? { label: ev.kind, cls: "border-edge text-dim" };
          return (
            <div key={i} className={`border-l-2 pl-2 py-0.5 whitespace-pre-wrap break-all ${meta.cls}`}>
              <span className="opacity-60 mr-1.5">[{meta.label}]</span>
              <span className="text-slate-300">{bodyOf(ev)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

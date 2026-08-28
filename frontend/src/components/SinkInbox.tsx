import { useState } from "react";
import type { SinkEvent } from "../types";

const CHANNELS = [
  { id: "all", label: "全部" },
  { id: "email", label: "邮件" },
  { id: "http", label: "HTTP" },
  { id: "internal", label: "内网" },
];

/** Attacker's drop box: everything the agent exfiltrated to mock sinks. */
export function SinkInbox({ events }: { events: SinkEvent[] }) {
  const [channel, setChannel] = useState("all");
  const shown = events.filter((e) => channel === "all" || e.channel === channel);
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-3 pt-2">
        {CHANNELS.map((c) => (
          <button
            key={c.id}
            onClick={() => setChannel(c.id)}
            className={`px-2 py-0.5 rounded text-[11px] font-mono transition-colors ${
              channel === c.id ? "bg-elevated text-slate-100 border border-edge" : "text-dim hover:text-slate-300"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="console-scroll flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[11px]">
        {shown.length === 0 && <div className="text-dim">// 还没有战利品外流到这里</div>}
        {shown.map((ev, i) => (
          <div key={i} className="panel bg-base/60 p-2 border-accent/30">
            <div className="flex justify-between text-dim mb-1">
              <span className="text-accent">◈ {ev.channel}</span>
              <span>{new Date(ev.ts * 1000).toLocaleTimeString()}</span>
            </div>
            <pre className="whitespace-pre-wrap break-all text-slate-300">
              {JSON.stringify(ev.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

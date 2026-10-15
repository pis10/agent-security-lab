"use client";
import { useState } from "react";
import type { SinkEvent } from "../types";
import { Icon } from "./Icon";

const CHANNELS = [
  { id: "all", label: "全部", icon: "inbox" },
  { id: "email", label: "邮件", icon: "mail" },
  { id: "http", label: "HTTP", icon: "globe" },
  { id: "internal", label: "内网", icon: "server" },
];

const CHANNEL_LABEL: Record<string, string> = { email: "邮件", http: "HTTP", internal: "内网" };

/**外发箱：助手发往站外的邮件、HTTP 请求与内网访问。 */
export function SinkInbox({ events }: { events: SinkEvent[] }) {
  const [channel, setChannel] = useState("all");
  const shown = events.filter((e) => channel === "all" || e.channel === channel);
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex gap-1 px-4 pt-3 pb-2 shrink-0">
        {CHANNELS.map((c) => {
          const n = c.id === "all" ? events.length : events.filter((e) => e.channel === c.id).length;
          return (
            <button
              type="button"
              key={c.id}
              onClick={() => setChannel(c.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] transition-colors ${
                channel === c.id ? "bg-ink text-white" : "text-muted hover:text-ink hover:bg-sunken"
              }`}
            >
              <Icon name={c.icon} size={12} />
              {c.label}
              {n > 0 && <span className="tabular-nums opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="product-scroll flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {shown.length === 0 && (
          <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-center text-muted">
            <Icon name="inbox" size={20} className="mb-2 text-line-strong" />
            <div className="text-[13px]">助手发往站外的邮件与请求会出现在这里</div>
          </div>
        )}
        {shown.map((ev, i) => (
          <div key={`${ev.ts}-${i}`} className="rise-in rounded-lg border border-danger/20 bg-danger-soft/40 p-3">
            <div className="flex justify-between items-center mb-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 font-medium text-danger">
                <Icon name="send" size={11} />
                外发 · {CHANNEL_LABEL[ev.channel] ?? ev.channel}
              </span>
              <span className="font-mono text-muted">
                {new Date(ev.ts * 1000).toLocaleTimeString("zh-CN", { hour12: false })}
              </span>
            </div>
            <pre className="whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-ink-2">
              {JSON.stringify(ev.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

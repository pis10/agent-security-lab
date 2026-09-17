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

export function SinkInbox({ events }: { events: SinkEvent[] }) {
  const [channel, setChannel] = useState("all");
  const shown = events.filter((e) => channel === "all" || e.channel === channel);
  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-1 px-3 pt-2">
        {CHANNELS.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={() => setChannel(c.id)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] transition-colors ${
              channel === c.id ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Icon name={c.icon} size={10} />
            {c.label}
          </button>
        ))}
      </div>
      <div className="product-scroll flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[12px]">
        {shown.length === 0 && (
          <div className="h-full min-h-[12rem] flex flex-col items-center justify-center text-center text-slate-400 font-sans">
            <Icon name="inbox" size={20} className="mb-2 text-slate-300" />
            <div className="text-[13px]">助手发往站外的邮件与请求将显示于此</div>
          </div>
        )}
        {shown.map((ev, i) => (
          <div key={i} className="rise-in rounded-md border border-slate-200 bg-slate-50 p-2">
            <div className="flex justify-between text-slate-400 mb-1 font-sans text-[11px]">
              <span className="inline-flex items-center gap-1 text-red-600">
                <Icon name="download" size={10} />
                {ev.channel}
              </span>
              <span>{new Date(ev.ts * 1000).toLocaleTimeString("zh-CN", { hour12: false })}</span>
            </div>
            <pre className="whitespace-pre-wrap break-all text-slate-700">{JSON.stringify(ev.payload, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

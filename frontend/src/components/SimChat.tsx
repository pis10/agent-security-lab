import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import { Icon } from "./Icon";

export type ChatTone = "console" | "light";
export type ChatAccent = "blue" | "orange" | "sky" | "violet" | "emerald";

const LIGHT_ACCENT: Record<
  ChatAccent,
  { user: string; send: string; avatar: string; pulse: string }
> = {
  blue: {
    user: "bg-blue-600 text-white",
    send: "bg-blue-600 hover:bg-blue-700 text-white",
    avatar: "bg-blue-100 text-blue-700",
    pulse: "bg-blue-500",
  },
  orange: {
    user: "bg-orange-600 text-white",
    send: "bg-orange-600 hover:bg-orange-700 text-white",
    avatar: "bg-orange-100 text-orange-700",
    pulse: "bg-orange-500",
  },
  sky: {
    user: "bg-sky-600 text-white",
    send: "bg-sky-600 hover:bg-sky-700 text-white",
    avatar: "bg-sky-100 text-sky-700",
    pulse: "bg-sky-500",
  },
  violet: {
    user: "bg-violet-600 text-white",
    send: "bg-violet-600 hover:bg-violet-700 text-white",
    avatar: "bg-violet-100 text-violet-700",
    pulse: "bg-violet-500",
  },
  emerald: {
    user: "bg-emerald-600 text-white",
    send: "bg-emerald-600 hover:bg-emerald-700 text-white",
    avatar: "bg-emerald-100 text-emerald-800",
    pulse: "bg-emerald-500",
  },
};

export function SimChat({
  messages,
  onSend,
  busy,
  placeholder = "对 AI 助手说点什么…",
  compact = false,
  tone = "console",
  accent = "blue",
  empty,
}: {
  messages: ChatMessage[];
  onSend: (m: string) => void;
  busy: boolean;
  placeholder?: string;
  compact?: boolean;
  tone?: ChatTone;
  accent?: ChatAccent;
  empty?: string;
}) {
  const [input, setInput] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const light = tone === "light";
  const a = LIGHT_ACCENT[accent];

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages.length, busy]);

  const send = () => {
    const m = input.trim();
    if (!m || busy) return;
    setInput("");
    onSend(m);
  };

  return (
    <div className={`flex flex-col h-full ${light ? "bg-white text-slate-800" : ""}`}>
      <div
        ref={boxRef}
        className={`${light ? "product-scroll" : "console-scroll"} flex-1 overflow-y-auto space-y-2.5 ${
          compact ? "p-2.5" : "p-3"
        }`}
      >
        {messages.length === 0 && (
          <div
            className={`flex items-start gap-1.5 text-[13px] leading-relaxed ${
              light ? "text-slate-400" : "text-dim text-xs font-mono"
            }`}
          >
            <Icon name="sparkles" size={12} className="mt-0.5" />
            {empty ?? "有什么可以帮你的？"}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rise-in flex items-end gap-1.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <span
              className={`h-5 w-5 rounded-md flex items-center justify-center shrink-0 ${
                light
                  ? m.role === "user"
                    ? a.avatar
                    : "bg-slate-100 text-slate-500"
                  : m.role === "user"
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-elevated text-dim border border-edge"
              }`}
            >
              <Icon name={m.role === "user" ? "user" : "bot"} size={11} />
            </span>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] whitespace-pre-wrap break-words ${
                light
                  ? m.role === "user"
                    ? `${a.user} rounded-br-sm`
                    : "bg-slate-100 text-slate-800 rounded-bl-sm"
                  : m.role === "user"
                    ? "bg-accent/10 border border-accent/30 text-slate-100 rounded-br-sm"
                    : "bg-elevated border border-edge text-slate-200 rounded-bl-sm"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && (
          <div
            className={`flex items-center gap-1.5 text-[12px] ${light ? "text-slate-400" : "text-dim font-mono"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${light ? a.pulse : "bg-info"}`} />
            正在回复…
          </div>
        )}
      </div>
      <div className={`flex gap-2 p-2 border-t ${light ? "border-slate-200 bg-slate-50/80" : "border-edge"}`}>
        <input
          className={
            light
              ? "flex-1 bg-white border border-slate-200 rounded-md px-3 py-1.5 text-[13px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
              : "flex-1 bg-base border border-edge rounded-md px-3 py-1.5 text-[13px] outline-none focus:border-info/60 focus:ring-1 focus:ring-info/30 transition"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={placeholder}
          disabled={busy}
        />
        <button
          className={
            light
              ? `inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 ${a.send}`
              : "btn-primary"
          }
          onClick={send}
          disabled={busy}
        >
          <Icon name="send" size={13} />
          发送
        </button>
      </div>
    </div>
  );
}

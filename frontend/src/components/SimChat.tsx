import { useState } from "react";
import type { ChatMessage } from "../types";

/** Shared embedded chat for sim UIs (bubble style). Sims with their own input
 * metaphor (e.g. terminal) can skip this and use onSend directly. */
export function SimChat({
  messages,
  onSend,
  busy,
  placeholder = "对 AI 助手说点什么…",
  compact = false,
}: {
  messages: ChatMessage[];
  onSend: (m: string) => void;
  busy: boolean;
  placeholder?: string;
  compact?: boolean;
}) {
  const [input, setInput] = useState("");
  const send = () => {
    const m = input.trim();
    if (!m || busy) return;
    setInput("");
    onSend(m);
  };
  return (
    <div className="flex flex-col h-full">
      <div className={`console-scroll flex-1 overflow-y-auto space-y-2 ${compact ? "p-2" : "p-3"}`}>
        {messages.length === 0 && (
          <div className="text-dim text-xs font-mono">// 对话框是空的——这就是你的攻击入口</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-1.5 text-[13px] whitespace-pre-wrap break-words ${
                m.role === "user"
                  ? "bg-info/15 border border-info/40 text-slate-100"
                  : "bg-elevated border border-edge text-slate-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {busy && <div className="text-dim text-xs font-mono">对方正在输入…</div>}
      </div>
      <div className="flex gap-2 p-2 border-t border-edge">
        <input
          className="flex-1 bg-base border border-edge rounded-md px-3 py-1.5 text-[13px] outline-none focus:border-info/60"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={placeholder}
          disabled={busy}
        />
        <button className="btn-primary" onClick={send} disabled={busy}>
          发送
        </button>
      </div>
    </div>
  );
}

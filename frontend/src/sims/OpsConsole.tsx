import { useEffect, useRef, useState } from "react";
import type { SimProps } from "../types";

/** 仿真运维控制台(靶标 devops_assistant):ttyd/Jenkins 混合体终端风。
 * 数据全部来自 simState(workdir_files / workdir),攻击输入经 onSend 发出。 */

function fileIcon(name: string): string {
  if (name.endsWith(".sh") || name.endsWith(".py")) return "📜";
  if (name.endsWith(".log")) return "🧾";
  if (name.endsWith(".json") || name.endsWith(".yaml") || name.endsWith(".yml")) return "🔧";
  return "📄";
}

function pathTail(workdir: unknown): string {
  if (typeof workdir !== "string" || !workdir) return "~/workdir";
  const parts = workdir.split("/").filter(Boolean);
  return parts.length ? `…/${parts[parts.length - 1]}` : "~/workdir";
}

export default function OpsConsole({ sessionId, simState, messages, onSend, busy }: SimProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const files: string[] = Array.isArray(simState.workdir_files)
    ? simState.workdir_files.filter((f: unknown): f is string => typeof f === "string")
    : [];

  // 终端流自动滚动到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = () => {
    const m = input.trim();
    if (!m || busy) return;
    setInput("");
    onSend(m);
  };

  return (
    <div className="h-full p-4">
      <div className="h-full flex flex-col rounded-lg border border-[#30363d] bg-[#0d1117] overflow-hidden shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 px-3 py-2 bg-[#161b22] border-b border-[#30363d] shrink-0">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <span className="font-mono text-xs text-[#c9d1d9]">
            redteam@ops-test: <span className="text-info">~/workdir</span>
          </span>
          <span className="flex-1" />
          <span className="px-2 py-0.5 rounded-full border border-warn/50 text-warn text-[10px] font-mono">
            TEST 环境 · 只读日常巡检
          </span>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* 左侧文件面板 */}
          <aside className="w-44 shrink-0 border-r border-[#30363d] flex flex-col min-h-0 bg-[#0d1117]">
            <div className="px-3 py-2 text-[10px] font-mono tracking-widest text-[#8b949e] border-b border-[#21262d]">
              WORKDIR
            </div>
            <div className="flex-1 overflow-y-auto console-scroll p-2 space-y-0.5">
              {files.length === 0 && (
                <div className="px-1 py-0.5 text-[11px] font-mono text-[#8b949e]">(目录读取中…)</div>
              )}
              {files.map((f) => (
                <div
                  key={f}
                  className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[12px] font-mono text-[#c9d1d9] hover:bg-[#161b22] cursor-default"
                  title={f}
                >
                  <span className="text-[11px]">{fileIcon(f)}</span>
                  <span className="truncate">{f}</span>
                </div>
              ))}
            </div>
            <div className="px-3 py-1.5 border-t border-[#21262d] text-[10px] font-mono text-[#8b949e] truncate">
              {pathTail(simState.workdir)}
            </div>
          </aside>

          {/* 中间终端流 */}
          <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto console-scroll px-4 py-3 font-mono text-[13px] leading-relaxed">
            {/* 开机横幅(空会话时也营造真实感) */}
            <div className="text-[#8b949e] whitespace-pre-wrap">
              {`OpsConsole v2.4.1 — 运维巡检助手 (build TEST)\n已连接 ops-test · 会话 ${sessionId.slice(0, 8)} · 权限: readonly\n输入指令开始巡检,例如:查看 report.txt 的内容`}
            </div>
            <div className="mt-3 space-y-1">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="break-words">
                    <span className="text-ok">redteam@ops:~$</span>{" "}
                    <span className="text-[#c9d1d9]">{m.content}</span>
                  </div>
                ) : (
                  <div key={i} className="text-[#c9d1d9] whitespace-pre-wrap break-words opacity-90">
                    {m.content}
                  </div>
                )
              )}
              {busy && (
                <div>
                  <span className="text-[#8b949e]">assistant 执行中</span>{" "}
                  <span className="cursor-blink text-[#c9d1d9]">▊</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部输入行 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[#30363d] shrink-0">
          <span className="text-ok font-mono text-sm select-none">❯</span>
          <input
            className="flex-1 bg-transparent outline-none border-none font-mono text-[13px] text-[#c9d1d9] placeholder:text-[#8b949e] disabled:opacity-50"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="给运维助手下指令…"
            disabled={busy}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}

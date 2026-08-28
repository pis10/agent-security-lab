import { useState } from "react";
import { SimChat } from "../components/SimChat";
import type { SimProps } from "../types";

/** NovaMail 仿真邮件客户端（靶标 mail_agent 的受害者视角）。
 * 浅色 SaaS 邮件界面：文件夹 / 邮件列表 / 阅读窗三栏，底部嵌 AI 助手。
 * 邮件与记忆均为只读展示，攻击输入只走 AI 助手输入框（onSend）。 */

interface Mail {
  id: number;
  from: string;
  subject: string;
  body: string;
}

/** id=3 的"账号安全同步"要渲染成系统通知样式 */
const SYSTEM_MAIL_ID = 3;

/** 列表右侧的装饰性时间（种子数据没有日期字段，按 id 伪造固定值） */
const FAKE_TIMES: Record<number, string> = { 1: "09:41", 2: "08:15", 3: "07:30" };
const fakeTime = (id: number) => FAKE_TIMES[id] ?? "昨天";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
];
const avatarColor = (from: string) => {
  let h = 0;
  for (const ch of from) h = (h + ch.charCodeAt(0)) % 997;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const senderName = (from: string) => from.split("@")[0] || from;
const senderInitial = (from: string) => senderName(from).slice(0, 1).toUpperCase() || "?";

function Avatar({ from, size = "h-8 w-8 text-sm" }: { from: string; size?: string }) {
  return (
    <div
      className={`${size} shrink-0 rounded-full flex items-center justify-center font-semibold ${avatarColor(from)}`}
    >
      {senderInitial(from)}
    </div>
  );
}

export default function MailClient({ simState, messages, onSend, busy }: SimProps) {
  const emails: Mail[] = Array.isArray(simState.emails) ? simState.emails : [];
  const memory: string[] = Array.isArray(simState.memory) ? simState.memory : [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 装饰性已读状态：id=1 默认已读，点击后标记已读
  const [readIds, setReadIds] = useState<ReadonlySet<number>>(new Set([1]));
  const [aiOpen, setAiOpen] = useState(true);

  const selected = emails.find((e) => e.id === selectedId) ?? emails[0] ?? null;
  const unreadCount = emails.filter((e) => !readIds.has(e.id)).length;
  const latestMemory = memory.length > 0 ? memory[memory.length - 1] : null;

  const select = (id: number) => {
    setSelectedId(id);
    setReadIds((prev) => new Set(prev).add(id));
  };

  const folders: { icon: string; name: string; count?: number; active?: boolean }[] = [
    { icon: "📥", name: "收件箱", count: unreadCount, active: true },
    { icon: "📤", name: "已发送" },
    { icon: "🚫", name: "垃圾邮件" },
    { icon: "🗑️", name: "已删除" },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-100 text-slate-800">
      {/* ── 顶部栏 ── */}
      <header className="h-12 shrink-0 bg-white border-b border-slate-200 flex items-center gap-4 px-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center text-white text-sm">
            ✉️
          </div>
          <span className="font-semibold text-[15px] tracking-tight">NovaMail</span>
          <span className="text-[10px] text-slate-400 border border-slate-200 rounded px-1 py-px">企业版</span>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="w-full max-w-md flex items-center gap-2 bg-slate-100 rounded-full px-3 py-1.5 text-[13px] text-slate-500">
            <span className="text-xs">🔍</span>
            <input
              className="flex-1 bg-transparent outline-none placeholder:text-slate-400"
              placeholder="搜索邮件、联系人…"
            />
          </div>
        </div>
        <span className="text-slate-400 text-sm">🔔</span>
        <span className="text-slate-400 text-sm">⚙️</span>
        <div className="h-7 w-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-medium">
          我
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* ── 左栏：文件夹 + 长期记忆 ── */}
        <aside className="w-44 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-3">
            <button className="w-full rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[13px] py-1.5 transition-colors">
              ✎ 写邮件
            </button>
          </div>
          <nav className="px-2 space-y-0.5">
            {folders.map((f) => (
              <div
                key={f.name}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-[13px] cursor-default ${
                  f.active
                    ? "bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600 rounded-r-none"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="text-xs">{f.icon}</span>
                <span className="flex-1">{f.name}</span>
                {f.count != null && f.count > 0 && (
                  <span className="text-[11px] text-blue-600 font-semibold">{f.count}</span>
                )}
              </div>
            ))}
          </nav>

          {/* 长期记忆小卡：记忆投毒关的可见性 */}
          <div className="mt-auto p-2">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
              <div className="flex items-center gap-1 text-[11px] font-medium text-amber-800">
                <span>🧠</span>
                <span>长期记忆</span>
                <span className="ml-auto font-normal text-amber-700">{memory.length} 条</span>
              </div>
              <div
                className="mt-1 text-[11px] leading-snug text-amber-900/80 truncate"
                title={latestMemory ?? undefined}
              >
                {latestMemory ?? "暂无记忆"}
              </div>
            </div>
          </div>
        </aside>

        {/* ── 中栏：邮件列表 ── */}
        <section className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-0">
          <div className="shrink-0 px-3 py-2 border-b border-slate-200 flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">收件箱</span>
            <span className="text-[11px] text-slate-400">{emails.length} 封邮件</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {emails.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400">正在同步收件箱…</div>
            )}
            {emails.map((e) => {
              const unread = !readIds.has(e.id);
              const isSel = selected?.id === e.id;
              return (
                <div
                  key={e.id}
                  onClick={() => select(e.id)}
                  className={`flex gap-2.5 px-3 py-2.5 border-b border-slate-100 cursor-pointer ${
                    isSel ? "bg-blue-50/70 border-l-2 border-l-blue-600 pl-[10px]" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar from={e.from} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`truncate text-[13px] ${unread ? "font-semibold text-slate-900" : "text-slate-600"}`}
                      >
                        {senderName(e.from)}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-slate-400">{fakeTime(e.id)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {e.id === SYSTEM_MAIL_ID && (
                        <span className="shrink-0 rounded bg-slate-200 text-slate-600 text-[10px] px-1 py-px">
                          系统
                        </span>
                      )}
                      <span
                        className={`truncate text-[13px] ${unread ? "font-medium text-slate-800" : "text-slate-600"}`}
                      >
                        {e.subject}
                      </span>
                      {unread && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                    </div>
                    <div className="truncate text-xs text-slate-400">{e.body.replace(/\s+/g, " ")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 右栏：阅读窗 + AI 助手 ── */}
        <section className="flex-1 min-w-0 flex flex-col bg-white">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {selected ? (
              <div className="max-w-2xl px-6 py-5">
                <h1 className="text-lg font-semibold leading-snug">{selected.subject}</h1>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar from={selected.from} size="h-9 w-9 text-base" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{senderName(selected.from)}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {selected.from} · 发送至 我 · {fakeTime(selected.id)}
                    </div>
                  </div>
                  <div className="ml-auto flex gap-1 text-xs text-slate-500">
                    <button className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50">回复</button>
                    <button className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50">转发</button>
                    <button className="rounded border border-slate-200 px-2 py-1 hover:bg-slate-50">删除</button>
                  </div>
                </div>

                {selected.id === SYSTEM_MAIL_ID && (
                  <div className="mt-4 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600">
                    <span>🛡️</span>
                    <span>
                      <span className="font-medium">系统通知</span> · 本邮件由 NovaMail
                      邮箱自动同步服务发出，相关操作已获系统授权
                    </span>
                  </div>
                )}

                <div className="my-4 border-t border-slate-200" />
                <div className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-slate-700">
                  {selected.body}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                正在同步邮件…
              </div>
            )}
          </div>

          {/* ── 嵌入式 AI 助手（可折叠，深色聊天面承载 SimChat） ── */}
          <div className="shrink-0 border-t border-slate-200">
            <button
              onClick={() => setAiOpen((v) => !v)}
              className="w-full h-9 px-3 flex items-center gap-2 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <span className="text-sm">✨</span>
              <span className="text-[13px] font-medium text-slate-700">NovaMail AI 助手</span>
              {busy && <span className="text-[11px] text-blue-600">正在思考…</span>}
              <span className="flex-1" />
              <span className="text-slate-400 text-xs">{aiOpen ? "收起 ▾" : "展开 ▸"}</span>
            </button>
            {aiOpen && (
              <div className="h-64 bg-panel">
                <SimChat
                  messages={messages}
                  onSend={onSend}
                  busy={busy}
                  placeholder="让 AI 帮你处理邮件…"
                  compact
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

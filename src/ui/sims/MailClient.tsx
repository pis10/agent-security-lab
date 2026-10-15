"use client";
import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { AiRail, Avatar, PBadge, PButton, SearchInput } from "../components/product";
import type { SimProps } from "../types";

interface Mail {
  id: number;
  from: string;
  subject: string;
  body: string;
  date?: string;
}

/**官方同步通知（id=3）。 */
const SYSTEM_MAIL_ID = 3;

const senderName = (from: string) => from.split("@")[0] || from;

function listTime(date?: string): string {
  if (!date) return "";
  const day = date.slice(5, 10);
  const time = date.slice(11, 16);
  return time || day;
}

export default function MailClient({ simState, messages, onSend, onResetChat, busy }: SimProps) {
  const emails: Mail[] = useMemo(
    () => (Array.isArray(simState.emails) ? [...simState.emails].reverse() : []),
    [simState.emails],
  );
  const memory: string[] = Array.isArray(simState.memory) ? simState.memory : [];

  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 已读/星标仅前端
  const [readIds, setReadIds] = useState<ReadonlySet<number>>(new Set([1]));
  const [starIds, setStarIds] = useState<ReadonlySet<number>>(new Set());
  const [folder, setFolder] = useState<"inbox" | "starred">("inbox");
  const [query, setQuery] = useState("");

  const visible = emails.filter((e) => {
    if (folder === "starred" && !starIds.has(e.id)) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return e.subject.toLowerCase().includes(q) || e.from.toLowerCase().includes(q) || e.body.toLowerCase().includes(q);
  });

  const selected = visible.find((e) => e.id === selectedId) ?? visible[0] ?? null;
  const unreadCount = emails.filter((e) => !readIds.has(e.id)).length;
  const latestMemory = memory.length > 0 ? memory[memory.length - 1] : null;

  const select = (id: number) => {
    setSelectedId(id);
    setReadIds((prev) => new Set(prev).add(id));
  };
  const toggleStar = (id: number) =>
    setStarIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const folders = [
    { key: "inbox" as const, icon: "inbox", name: "收件箱", count: unreadCount },
    { key: "starred" as const, icon: "star", name: "星标邮件", count: starIds.size },
    { key: null, icon: "send", name: "已发送" },
    { key: null, icon: "file-text", name: "草稿" },
    { key: null, icon: "x", name: "垃圾邮件" },
    { key: null, icon: "trash", name: "已删除" },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-100 text-slate-800 relative">
      <header className="shrink-0 bg-white border-b border-slate-200 flex items-center gap-4 px-4 py-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-product">
            <Icon name="mail" size={16} />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">NovaMail</span>
          <PBadge tone="blue">企业版</PBadge>
        </div>
        <div className="flex-1 flex justify-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="搜索邮件、联系人…"
            className="w-full max-w-md rounded-full"
          />
        </div>
        <button type="button" className="text-slate-400 hover:text-slate-600 transition-colors">
          <Icon name="bell" size={17} />
        </button>
        <button type="button" className="text-slate-400 hover:text-slate-600 transition-colors">
          <Icon name="settings" size={17} />
        </button>
        <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-[12px] font-medium">
          <Icon name="sparkles" size={12} />
          助手
        </span>
        <Avatar name="me@example.com" className="h-8 w-8 text-xs" />
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-48 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <nav className="px-2 pt-3 space-y-0.5">
            {folders.map((f) => {
              const active = f.key != null && folder === f.key;
              return (
                <button
                  type="button"
                  key={f.name}
                  onClick={() => f.key && setFolder(f.key)}
                  className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : f.key
                        ? "text-slate-600 hover:bg-slate-50"
                        : "text-slate-400 cursor-default"
                  }`}
                >
                  <Icon name={f.icon} size={14} />
                  <span className="flex-1 text-left">{f.name}</span>
                  {f.count != null && f.count > 0 && (
                    <span className="text-[11px] text-blue-600 font-semibold">{f.count}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto p-2.5 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <Icon name="file-text" size={12} />
              <span>助手笔记</span>
              {memory.length > 0 && <span className="ml-auto font-normal text-slate-400">{memory.length}</span>}
            </div>
            <div
              className="mt-1 text-[11px] leading-snug text-slate-500 line-clamp-3"
              title={latestMemory ?? undefined}
            >
              {latestMemory ?? "暂无备忘"}
            </div>
          </div>
        </aside>

        <section className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col min-h-0 xl:w-80">
          <div className="shrink-0 px-3.5 py-2.5 border-b border-slate-200 flex items-baseline gap-2">
            <span className="text-[13px] font-semibold">{folder === "inbox" ? "收件箱" : "星标邮件"}</span>
            <span className="text-[11px] text-slate-400">{visible.length} 封邮件</span>
            {query && (
              <PBadge tone="blue" className="ml-auto">
                筛选中
              </PBadge>
            )}
          </div>
          <div className="flex-1 overflow-y-auto product-scroll">
            {visible.length === 0 && (
              <div className="p-8 text-center text-xs text-slate-400">
                {query ? `没有匹配「${query}」的邮件` : "正在同步收件箱…"}
              </div>
            )}
            {visible.map((e) => {
              const unread = !readIds.has(e.id);
              const isSel = selected?.id === e.id;
              return (
                <div
                  key={e.id}
                  onClick={() => select(e.id)}
                  className={`group flex gap-2.5 px-3.5 py-2.5 border-b border-slate-100 cursor-pointer transition-colors ${
                    isSel ? "bg-blue-50/70" : "hover:bg-slate-50"
                  }`}
                >
                  <Avatar name={e.from} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`truncate text-[13px] ${unread ? "font-semibold text-slate-900" : "text-slate-600"}`}
                      >
                        {senderName(e.from)}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-slate-400">{listTime(e.date)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {e.id === SYSTEM_MAIL_ID && (
                        <span className="shrink-0 rounded-sm bg-slate-200 text-slate-600 text-[10px] px-1 py-px">
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
                    <div className="truncate text-xs text-slate-400 mt-0.5">{e.body.replace(/\s+/g, " ")}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex-1 min-w-0 flex flex-col bg-white">
          <div className="flex-1 min-h-0 overflow-y-auto product-scroll">
            {selected ? (
              <div className="max-w-2xl px-7 py-6">
                <div className="flex items-start gap-3">
                  <h1 className="flex-1 text-lg font-semibold leading-snug text-slate-900">{selected.subject}</h1>
                  <button
                    type="button"
                    onClick={() => toggleStar(selected.id)}
                    className={`mt-0.5 transition-colors ${
                      starIds.has(selected.id) ? "text-amber-500" : "text-slate-300 hover:text-slate-400"
                    }`}
                    title="星标"
                  >
                    <Icon
                      name="star"
                      size={17}
                      strokeWidth={starIds.has(selected.id) ? 0 : 1.8}
                      className={starIds.has(selected.id) ? "fill-amber-400" : ""}
                    />
                  </button>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Avatar name={selected.from} className="h-10 w-10 text-sm" />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-slate-800">{senderName(selected.from)}</div>
                    <div className="text-xs text-slate-400 truncate">
                      {selected.from} · 发送至 我{selected.date ? ` · ${selected.date}` : ""}
                    </div>
                  </div>
                  <div className="ml-auto flex gap-1.5">
                    <PButton variant="outline" icon="reply">
                      回复
                    </PButton>
                    <PButton variant="outline" icon="forward">
                      转发
                    </PButton>
                    <PButton variant="outline" icon="trash">
                      删除
                    </PButton>
                  </div>
                </div>

                {selected.id === SYSTEM_MAIL_ID && (
                  <div className="mt-5 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-xs text-slate-600">
                    <Icon name="shield" size={14} className="text-slate-500" />
                    <span>
                      <span className="font-medium">系统通知</span> · 本邮件由 NovaMail 同步服务发出
                    </span>
                  </div>
                )}

                <div className="my-5 border-t border-slate-200" />
                <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{selected.body}</div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">正在同步邮件…</div>
            )}
          </div>
        </section>

        <AiRail
          title="NovaMail 助手"
          subtitle="读信、起草、总结"
          accent="blue"
          messages={messages}
          onSend={onSend}
          onResetChat={onResetChat}
          busy={busy}
          placeholder="请助手处理邮件或起草回复…"
          suggestions={["这封邮件大概讲什么", "处理一下收件箱里的待办", "帮我回复 HR 的考勤确认邮件"]}
          empty="可协助处理收件箱、起草回复或总结当前邮件。"
        />
      </div>
    </div>
  );
}

"use client";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import { AiWidget, Avatar, EmptyState, PBadge, PButton, SearchInput, Stat } from "../components/product";
import type { SimProps } from "../types";

interface TicketRow {
  id: string;
  tenant: string;
  title: string;
}

interface KbDoc {
  filename: string;
  title: string;
}

type Tab = "tickets" | "kb";

const SHOP_OF: Record<string, string> = {
  tenant_a: "橙犀旗舰店",
  tenant_b: "邻家小铺",
  guest: "访客",
};
const shopName = (id: string) => SHOP_OF[id] ?? id;

const STATUS_POOL = [
  { name: "待处理", tone: "amber" as const },
  { name: "处理中", tone: "blue" as const },
  { name: "已解决", tone: "green" as const },
  { name: "已关闭", tone: "slate" as const },
];
const PRIORITY_POOL = [
  { name: "低", tone: "slate" as const },
  { name: "中", tone: "blue" as const },
  { name: "高", tone: "amber" as const },
  { name: "紧急", tone: "red" as const },
];
const CHANNELS = ["在线客服", "热线电话", "邮件", "APP 留言"];

const BASE_TS = Date.parse("2026-08-31T17:30:00+08:00");

function hashOf(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function ticketMeta(id: string) {
  const h = hashOf(id);
  const updatedTs = BASE_TS - (40 + (h % (60 * 24 * 6))) * 60_000;
  const createdTs = updatedTs - (30 + ((h >> 6) % 2880)) * 60_000;
  return {
    status: STATUS_POOL[h % STATUS_POOL.length],
    priority: PRIORITY_POOL[(h >> 4) % PRIORITY_POOL.length],
    channel: CHANNELS[(h >> 8) % CHANNELS.length],
    updatedTs,
    createdTs,
  };
}

function docCategory(doc: KbDoc): { name: string; tone: "amber" | "violet" | "blue" | "green" | "slate" } {
  const t = doc.title;
  if (/VIP|会员|积分/.test(t)) return { name: "会员服务", tone: "violet" };
  if (/发票|财务/.test(t)) return { name: "财务发票", tone: "blue" };
  if (/运费|配送|物流/.test(t)) return { name: "物流配送", tone: "green" };
  if (/退货|售后|维修/.test(t)) return { name: "售后服务", tone: "amber" };
  if (/时间|营业/.test(t)) return { name: "服务时间", tone: "slate" };
  return { name: "帮助中心", tone: "slate" };
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-20 shrink-0 pt-0.5 text-xs text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-[13px] text-slate-700">{children}</span>
    </div>
  );
}

export default function SupportShop({ simState, messages, onSend, onAct, onResetChat, busy }: SimProps) {
  const tickets: TicketRow[] = Array.isArray(simState.tickets) ? simState.tickets : [];
  const kb: KbDoc[] = Array.isArray(simState.kb) ? simState.kb : [];
  const tenant = typeof simState.tenant === "string" && simState.tenant ? simState.tenant : "guest";

  const [tab, setTab] = useState<Tab>("tickets");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [openDocName, setOpenDocName] = useState<string | null>(null);
  const [followedIds, setFollowedIds] = useState<ReadonlySet<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(true);
  const [createKb, setCreateKb] = useState(false);
  const [kbTitle, setKbTitle] = useState("");
  const [kbBody, setKbBody] = useState("");
  const [kbBusy, setKbBusy] = useState(false);
  const [kbErr, setKbErr] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const ownTickets = useMemo(() => tickets.filter((t) => t.tenant === tenant), [tickets, tenant]);
  const visibleTickets = useMemo(
    () =>
      [...ownTickets]
        .filter((t) => statusFilter === "all" || ticketMeta(t.id).status.name === statusFilter)
        .filter((t) => !q || t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
        .sort((a, b) => ticketMeta(b.id).updatedTs - ticketMeta(a.id).updatedTs),
    [ownTickets, statusFilter, q],
  );
  const visibleDocs = kb.filter((d) => !q || d.title.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q));

  const pendingCount = ownTickets.filter((t) => ticketMeta(t.id).status.name === "待处理").length;
  const ownCount = ownTickets.length;
  const statusCount = (name: string) => ownTickets.filter((t) => ticketMeta(t.id).status.name === name).length;

  const openTicket = tickets.find((t) => t.id === openTicketId) ?? null;
  const openDoc = kb.find((d) => d.filename === openDocName) ?? null;
  const drawerOpen = openTicket != null || openDoc != null;

  const askAi = (text: string) => {
    setChatOpen(true);
    if (!busy) onSend(text);
  };
  const toggleFollow = (id: string) =>
    setFollowedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const NAV = [
    { key: "tickets" as Tab, icon: "ticket", name: "工单管理", count: ownCount },
    { key: "kb" as Tab, icon: "book-open", name: "知识库", count: kb.length },
    { key: null, icon: "package", name: "订单管理" },
    { key: null, icon: "users", name: "客户管理" },
    { key: null, icon: "activity", name: "数据报表" },
    { key: null, icon: "settings", name: "服务设置" },
  ];

  return (
    <div className="relative h-full flex flex-col bg-slate-100 text-slate-800">
      <header className="shrink-0 bg-white border-b border-slate-200 flex items-center gap-4 px-4 py-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-linear-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-product">
            <Icon name="store" size={16} />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">橙犀</span>
          <PBadge tone="amber">客服工作台</PBadge>
        </div>
        <div className="flex-1 flex justify-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={tab === "tickets" ? "搜索工单号、标题、店铺…" : "搜索文档标题、文件名…"}
            className="w-full max-w-md rounded-full"
          />
        </div>
        <button type="button" className="text-slate-400 hover:text-slate-600 transition-colors" title="通知">
          <Icon name="bell" size={17} />
        </button>
        <button type="button" className="text-slate-400 hover:text-slate-600 transition-colors" title="设置">
          <Icon name="settings" size={17} />
        </button>
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-[12px] font-medium text-slate-700 leading-tight">客服坐席 · 小犀</div>
            <div className="text-[10px] text-slate-400 leading-tight">{shopName(tenant)}</div>
          </div>
          <Avatar name={shopName(tenant)} className="h-8 w-8 text-xs" />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-48 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-3">
            <button
              type="button"
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[13px] font-medium py-2 shadow-product transition-colors"
            >
              <Icon name="plus" size={13} />
              新建工单
            </button>
          </div>
          <nav className="px-2 space-y-0.5">
            {NAV.map((n) => {
              const active = n.key != null && tab === n.key;
              return (
                <button
                  type="button"
                  key={n.name}
                  onClick={() => {
                    if (!n.key) return;
                    setTab(n.key);
                    setStatusFilter("all");
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-orange-50 text-orange-700 font-medium"
                      : n.key
                        ? "text-slate-600 hover:bg-slate-50"
                        : "text-slate-400 cursor-default"
                  }`}
                >
                  <Icon name={n.icon} size={14} />
                  <span className="flex-1 text-left">{n.name}</span>
                  {n.count != null && n.count > 0 && (
                    <span className="text-[11px] text-orange-600 font-semibold">{n.count}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="mt-auto p-2.5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <Icon name="store" size={12} />
                <span>当前店铺</span>
              </div>
              <div className="mt-1 text-[12px] font-semibold text-slate-800">{shopName(tenant)}</div>
            </div>
          </div>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto product-scroll">
            {tab === "tickets" ? (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  <Stat icon="ticket" label="全部工单" value={ownCount} />
                  <Stat icon="clock" label="待处理" value={pendingCount} />
                  <Stat icon="store" label="本店工单" value={ownCount} />
                  <Stat icon="book-open" label="知识库文档" value={kb.length} />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {["all", ...STATUS_POOL.map((s) => s.name)].map((s) => {
                    const active = statusFilter === s;
                    const count = s === "all" ? ownCount : statusCount(s);
                    return (
                      <button
                        type="button"
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                          active
                            ? "border-orange-300 bg-orange-50 text-orange-700 font-medium"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                        }`}
                      >
                        {s === "all" ? "全部" : s}
                        <span className={active ? "text-orange-500" : "text-slate-400"}>{count}</span>
                      </button>
                    );
                  })}
                  {query && (
                    <PBadge tone="blue" className="ml-auto">
                      搜索筛选中
                    </PBadge>
                  )}
                </div>

                {ownTickets.length === 0 ? (
                  <div className="p-card h-48">
                    <EmptyState icon="ticket" title="正在同步工单数据…" />
                  </div>
                ) : visibleTickets.length === 0 ? (
                  <div className="p-card h-48">
                    <EmptyState icon="search" title="没有匹配的工单" hint={`当前筛选：${query || statusFilter}`} />
                  </div>
                ) : (
                  <div className="p-card overflow-hidden">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-400">
                          <th className="px-3.5 py-2.5 font-medium">工单号</th>
                          <th className="px-3.5 py-2.5 font-medium">标题</th>
                          <th className="px-3.5 py-2.5 font-medium">店铺</th>
                          <th className="px-3.5 py-2.5 font-medium">优先级</th>
                          <th className="px-3.5 py-2.5 font-medium">状态</th>
                          <th className="px-3.5 py-2.5 font-medium">更新时间</th>
                          <th className="w-10 px-3.5 py-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTickets.map((t) => {
                          const meta = ticketMeta(t.id);
                          const foreign = t.tenant !== tenant;
                          return (
                            <tr
                              key={t.id}
                              onClick={() => setOpenTicketId(t.id)}
                              className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <td className="px-3.5 py-2.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="font-mono text-[12px] text-slate-700">{t.id}</span>
                                  {followedIds.has(t.id) && (
                                    <Icon name="check" size={12} className="text-emerald-600" />
                                  )}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5 max-w-[260px]">
                                <span className="block truncate text-slate-800">{t.title}</span>
                              </td>
                              <td className="px-3.5 py-2.5">
                                <PBadge tone={foreign ? "slate" : "amber"}>{shopName(t.tenant)}</PBadge>
                              </td>
                              <td className="px-3.5 py-2.5">
                                <PBadge tone={meta.priority.tone}>{meta.priority.name}</PBadge>
                              </td>
                              <td className="px-3.5 py-2.5">
                                <PBadge tone={meta.status.tone}>{meta.status.name}</PBadge>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono text-xs text-slate-400">
                                {fmtTime(meta.updatedTs)}
                              </td>
                              <td className="px-3.5 py-2.5 text-slate-300">
                                <Icon name="chevron-right" size={14} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="p-card px-4 py-3 flex items-center gap-2 text-xs text-slate-500">
                  <Icon name="database" size={14} className="text-slate-400" />
                  <span className="flex-1">共 {kb.length} 篇文档</span>
                  <button
                    type="button"
                    onClick={() => setCreateKb(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 hover:border-slate-300"
                  >
                    <Icon name="plus" size={12} />
                    新建文档
                  </button>
                </div>

                {visibleDocs.length === 0 ? (
                  <div className="p-card h-48">
                    <EmptyState
                      icon="book-open"
                      title={kb.length === 0 ? "正在同步知识库…" : "没有匹配的文档"}
                      hint={query ? `关键词：${query}` : undefined}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {visibleDocs.map((d) => {
                      const cat = docCategory(d);
                      return (
                        <div
                          key={d.filename}
                          onClick={() => setOpenDocName(d.filename)}
                          className="p-card p-4 cursor-pointer hover:border-orange-300 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                              <Icon name="file-text" size={17} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-medium text-slate-800">{d.title}</div>
                              <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{d.filename}</div>
                            </div>
                            <PBadge tone={cat.tone}>{cat.name}</PBadge>
                          </div>
                          <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Icon name="check" size={11} className="text-emerald-600" />
                              可检索
                            </span>
                            <span className="ml-auto inline-flex items-center gap-0.5 text-slate-400">
                              查看
                              <Icon name="chevron-right" size={12} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <AiWidget
        title="小犀"
        greeting="你好，我是小犀。可查询工单或咨询售后。"
        accent="orange"
        messages={messages}
        onSend={onSend}
        onResetChat={onResetChat}
        busy={busy}
        placeholder="输入你的问题…"
        suggestions={["包装破了怎么换货", "查一下工单 T-1001"]}
        open={chatOpen}
        onOpenChange={setChatOpen}
        className={drawerOpen ? "right-[400px]" : "right-4"}
      />

      {drawerOpen && (
        <div className="absolute inset-0 z-20">
          <div
            className="absolute inset-0 bg-slate-900/20"
            onClick={() => {
              setOpenTicketId(null);
              setOpenDocName(null);
            }}
          />
          <aside className="absolute right-0 top-0 bottom-0 w-[380px] bg-white border-l border-slate-200 shadow-xl flex flex-col rise-in">
            {openTicket ? (
              <>
                <div className="shrink-0 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                  <Icon name="ticket" size={15} className="text-slate-400" />
                  <span className="text-[13px] font-semibold text-slate-800">工单详情</span>
                  <span className="font-mono text-xs text-slate-400">{openTicket.id}</span>
                  <button
                    type="button"
                    className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
                    onClick={() => setOpenTicketId(null)}
                    title="关闭"
                  >
                    <Icon name="x" size={15} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto product-scroll px-4 py-4">
                  <h2 className="text-[15px] font-semibold leading-snug text-slate-900">{openTicket.title}</h2>
                  <div className="mt-2 flex items-center gap-1.5">
                    <PBadge tone={ticketMeta(openTicket.id).status.tone}>
                      {ticketMeta(openTicket.id).status.name}
                    </PBadge>
                    <PBadge tone={ticketMeta(openTicket.id).priority.tone}>
                      {ticketMeta(openTicket.id).priority.name}优先级
                    </PBadge>
                  </div>

                  <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                    <MetaRow label="所属店铺">
                      <span className="text-[12px]">{shopName(openTicket.tenant)}</span>
                    </MetaRow>
                    <MetaRow label="来源渠道">{ticketMeta(openTicket.id).channel}</MetaRow>
                    <MetaRow label="受理坐席">坐席 03 · 小犀</MetaRow>
                    <MetaRow label="创建时间">
                      <span className="font-mono text-[12px]">2026-{fmtTime(ticketMeta(openTicket.id).createdTs)}</span>
                    </MetaRow>
                    <MetaRow label="更新时间">
                      <span className="font-mono text-[12px]">2026-{fmtTime(ticketMeta(openTicket.id).updatedTs)}</span>
                    </MetaRow>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                      <Icon name="lock" size={13} className="mt-0.5 shrink-0 text-slate-400" />
                      <span>工单正文需由坐席助手拉取后展示。可点击下方按钮查询。</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => askAi(`帮我查询工单 ${openTicket.id} 的详情`)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Icon name="bot" size={14} />
                        由助手查询
                      </button>
                      <PButton
                        variant="outline"
                        icon={followedIds.has(openTicket.id) ? "check" : "plus"}
                        onClick={() => toggleFollow(openTicket.id)}
                      >
                        {followedIds.has(openTicket.id) ? "已跟进" : "标记跟进"}
                      </PButton>
                    </div>
                  </div>
                </div>
              </>
            ) : openDoc ? (
              <>
                <div className="shrink-0 border-b border-slate-200 px-4 py-3 flex items-center gap-2">
                  <Icon name="file-text" size={15} className="text-slate-400" />
                  <span className="text-[13px] font-semibold text-slate-800">知识库文档</span>
                  <button
                    type="button"
                    className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
                    onClick={() => setOpenDocName(null)}
                    title="关闭"
                  >
                    <Icon name="x" size={15} />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto product-scroll px-4 py-4">
                  <h2 className="text-[15px] font-semibold leading-snug text-slate-900">{openDoc.title}</h2>
                  <div className="mt-2 flex items-center gap-1.5">
                    <PBadge tone={docCategory(openDoc).tone}>{docCategory(openDoc).name}</PBadge>
                  </div>

                  <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                    <MetaRow label="文件名">
                      <span className="font-mono text-[12px]">{openDoc.filename}</span>
                    </MetaRow>
                    <MetaRow label="所属栏目">{docCategory(openDoc).name}</MetaRow>
                    <MetaRow label="索引状态">
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <Icon name="check" size={12} />
                        可检索
                      </span>
                    </MetaRow>
                    <MetaRow label="维护人">客服知识库运营组</MetaRow>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    <div className="flex gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
                      <Icon name="info" size={13} className="mt-0.5 shrink-0 text-slate-400" />
                      <span>可点击下方按钮查阅该文档。</span>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => askAi(`帮我查一下知识库里「${openDoc.title}」的内容`)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium bg-orange-600 text-white hover:bg-orange-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Icon name="bot" size={14} />
                      由助手打开
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      )}

      {createKb && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-pop p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-slate-900">新建知识库文档</div>
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setCreateKb(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <label className="block text-[12px] text-slate-500">
              标题
              <input
                value={kbTitle}
                onChange={(e) => setKbTitle(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800"
              />
            </label>
            <label className="block text-[12px] text-slate-500">
              正文
              <textarea
                value={kbBody}
                onChange={(e) => setKbBody(e.target.value)}
                rows={10}
                className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] text-slate-800 font-mono"
                placeholder="支持 Markdown"
              />
            </label>
            {kbErr && <div className="text-[12px] text-red-600">{kbErr}</div>}
            <button
              type="button"
              disabled={kbBusy || !onAct}
              onClick={() => {
                if (!onAct) return;
                setKbBusy(true);
                setKbErr(null);
                onAct("create_kb", { title: kbTitle, content: kbBody })
                  .then(() => {
                    setCreateKb(false);
                    setKbTitle("");
                    setKbBody("");
                  })
                  .catch((e) => setKbErr(e instanceof Error ? e.message : String(e)))
                  .finally(() => setKbBusy(false));
              }}
              className="w-full rounded-md bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-[13px] py-2"
            >
              {kbBusy ? "保存中…" : "保存到知识库"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

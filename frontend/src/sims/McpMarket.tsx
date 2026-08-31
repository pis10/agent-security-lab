import { useMemo, useState } from "react";
import { Icon } from "../components/Icon";
import {
  AiRail,
  Avatar,
  EmptyState,
  PBadge,
  PButton,
  SearchInput,
  Stat,
} from "../components/product";
import type { SimProps } from "../types";

/** MCP Hub 仿真工具市场（靶标 mcp_playground 的受害者视角）。
 * 浅色 SaaS 市场：左栏视图/分类导航 + server 卡片网格 + 右侧 Host 助手栏 / 详情抽屉。
 * simState 只提供 Host 实际装载的 server（name + tools 描述全文）与 remote 端点元信息；
 * 发布者、版本、下载量等市场资料为前端静态富化，与 data/seeds/mcp_playground/marketplace.json 一致。
 * 攻击面即工具描述：抽屉里 whitespace-pre-wrap 全文渲染、绝不截断，投毒指令玩家可完整读到。 */

interface McpToolSpec {
  name: string;
  description: string;
}

interface McpServerSpec {
  name: string;
  tools: McpToolSpec[];
}

/** 市场展示资料（静态富化；live server 只有 name/tools 来自后端） */
interface ServerMeta {
  publisher: string;
  publisherLabel: string;
  verified: boolean;
  category: string;
  summary: string;
  version: string;
  downloads: string;
  rating: string;
  updatedAt: string;
  icon: string;
  tone: string;
}

interface MarketItem extends ServerMeta {
  name: string;
  transport: string;
  tools: McpToolSpec[];
  live: boolean; // true = Host 启动时实际装载（来自 simState.servers）
}

/** 与 marketplace.json 中两条已装载条目一一对应 */
const META: Record<string, ServerMeta> = {
  "server-a": {
    publisher: "internal-test",
    publisherLabel: "内部测试组",
    verified: true,
    category: "数据与存储",
    summary: "配置保险库：集中托管各环境的同步码与接入配置，供授权工具按需读取。",
    version: "1.4.2",
    downloads: "3.4k",
    rating: "4.6",
    updatedAt: "2026-08-12",
    icon: "database",
    tone: "bg-blue-50 text-blue-600 border border-blue-100",
  },
  "server-b": {
    publisher: "third-party-unvetted",
    publisherLabel: "第三方发布者",
    verified: false,
    category: "生产力",
    summary: "轻量笔记工具：把一句话笔记追加到本地日志，随写随查，零配置上手。",
    version: "0.3.1",
    downloads: "986",
    rating: "3.9",
    updatedAt: "2026-07-28",
    icon: "pen",
    tone: "bg-amber-50 text-amber-600 border border-amber-100",
  },
};

/** 市场上架但本地未装载的条目（纯展示目录，与 marketplace.json 新增条目一致） */
const CATALOG: MarketItem[] = [
  {
    name: "calendar-tools",
    publisher: "nova-suite",
    publisherLabel: "Nova 套件官方",
    verified: true,
    category: "生产力",
    summary: "读取与创建日历事件，支持日程冲突检查与会前提醒。",
    version: "2.1.0",
    downloads: "8.2k",
    rating: "4.8",
    updatedAt: "2026-08-20",
    icon: "clock",
    tone: "bg-violet-50 text-violet-600 border border-violet-100",
    transport: "remote",
    live: false,
    tools: [
      {
        name: "list_events",
        description: "列出指定日期范围内的日历事件，返回标题、时间与参与人。",
      },
      {
        name: "create_event",
        description: "创建日历事件。参数：标题、开始时间、结束时间、参与人列表。",
      },
    ],
  },
  {
    name: "sheet-bridge",
    publisher: "datatech-cn",
    publisherLabel: "数科数据",
    verified: true,
    category: "数据与存储",
    summary: "在线表格读写桥：按工作表查询、筛选与追加行，支持分页。",
    version: "1.0.5",
    downloads: "5.1k",
    rating: "4.5",
    updatedAt: "2026-08-05",
    icon: "layers",
    tone: "bg-emerald-50 text-emerald-600 border border-emerald-100",
    transport: "remote",
    live: false,
    tools: [
      {
        name: "query_sheet",
        description: "按工作表与筛选条件查询表格行，支持分页与排序。",
      },
      {
        name: "append_rows",
        description: "向指定工作表末尾追加一行或多行数据。",
      },
    ],
  },
  {
    name: "code-review-kit",
    publisher: "devtools-io",
    publisherLabel: "DevTools 工作室",
    verified: false,
    category: "开发工具",
    summary: "拉取请求的 diff 摘要与评审意见草稿，输出 markdown。",
    version: "0.9.2",
    downloads: "1.7k",
    rating: "4.1",
    updatedAt: "2026-06-30",
    icon: "terminal",
    tone: "bg-cyan-50 text-cyan-600 border border-cyan-100",
    transport: "remote",
    live: false,
    tools: [
      {
        name: "summarize_diff",
        description: "拉取指定 PR 的 diff 并生成变更摘要。",
      },
      {
        name: "draft_review",
        description: "基于 diff 摘要起草评审意见，输出为 markdown。",
      },
    ],
  },
];

/** 后端装载了未登记的 server 时的兜底资料（不进分类导航，仅"全部"可见） */
function fallbackMeta(name: string): ServerMeta {
  return {
    publisher: "unknown",
    publisherLabel: "未登记发布者",
    verified: false,
    category: "其他",
    summary: `server ${name} 由 Host 配置直接装载，市场暂无收录资料。`,
    version: "0.1.0",
    downloads: "—",
    rating: "—",
    updatedAt: "—",
    icon: "server",
    tone: "bg-slate-100 text-slate-500 border border-slate-200",
  };
}

const CATEGORIES = ["全部", "数据与存储", "开发工具", "生产力"] as const;
const CATEGORY_ICONS: Record<string, string> = {
  全部: "store",
  数据与存储: "database",
  开发工具: "terminal",
  生产力: "zap",
};

const toolsOf = (s: McpServerSpec): McpToolSpec[] => (Array.isArray(s.tools) ? s.tools : []);

export default function McpMarket({ simState, messages, onSend, busy }: SimProps) {
  const liveServers: McpServerSpec[] = useMemo(
    () => (Array.isArray(simState.servers) ? (simState.servers as McpServerSpec[]) : []),
    [simState.servers]
  );
  const remote = (simState.remote ?? {}) as Record<string, string>;

  const [view, setView] = useState<"discover" | "installed">("discover");
  const [category, setCategory] = useState<string>("全部");
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // 装饰性安装状态：仅前端，针对市场上架但未装载的条目
  const [extraInstalled, setExtraInstalled] = useState<ReadonlySet<string>>(new Set());

  const liveNames = useMemo(() => new Set(liveServers.map((s) => s.name)), [liveServers]);
  const isInstalled = (name: string) => liveNames.has(name) || extraInstalled.has(name);

  const items: MarketItem[] = useMemo(() => {
    const live: MarketItem[] = liveServers.map((s) => ({
      ...(META[s.name] ?? fallbackMeta(s.name)),
      name: s.name,
      transport: "stdio",
      tools: toolsOf(s),
      live: true,
    }));
    return [...live, ...CATALOG.filter((c) => !liveNames.has(c.name))];
  }, [liveServers, liveNames]);

  const visible = items.filter((it) => {
    if (view === "installed" && !isInstalled(it.name)) return false;
    if (category !== "全部" && it.category !== category) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    const haystack = [it.name, it.publisher, it.publisherLabel, it.summary];
    for (const t of it.tools) haystack.push(t.name ?? "", t.description ?? "");
    return haystack.some((s) => s.toLowerCase().includes(q));
  });

  const selected = items.find((it) => it.name === selectedName) ?? null;
  const totalTools = liveServers.reduce((n, s) => n + toolsOf(s).length, 0);
  const installedCount = items.filter((it) => isInstalled(it.name)).length;
  const publisherCount = new Set(items.map((it) => it.publisher)).size;

  const toggleInstall = (name: string) =>
    setExtraInstalled((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="h-full flex flex-col bg-slate-100 text-slate-800">
      {/* ── 顶栏 ── */}
      <header className="shrink-0 bg-white border-b border-slate-200 flex items-center gap-4 px-4 py-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow-product">
            <Icon name="server" size={16} />
          </div>
          <span className="font-semibold text-[15px] tracking-tight">MCP Hub</span>
          <PBadge tone="blue">工具市场</PBadge>
        </div>
        <div className="flex-1 flex justify-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="搜索 servers、工具、发布者…"
            className="w-full max-w-md rounded-full"
          />
        </div>
        <div className="hidden md:flex shrink-0 items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          已连接 Host:
          <span className="font-mono font-semibold text-slate-700">mcp-host.internal</span>
        </div>
        <button className="text-slate-400 hover:text-slate-600 transition-colors">
          <Icon name="bell" size={17} />
        </button>
        <Avatar name="me@example.com" className="h-8 w-8 text-xs" />
      </header>

      <div className="flex-1 flex min-h-0 relative">
        {/* ── 左栏:视图 + 分类 + Host 连接状态 ── */}
        <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <nav className="p-2 space-y-0.5">
            {(
              [
                ["discover", "发现市场", "store", null],
                ["installed", "已安装", "package", installedCount],
              ] as const
            ).map(([key, name, icon, count]) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon name={icon} size={14} />
                  <span className="flex-1 text-left">{name}</span>
                  {count != null && count > 0 && (
                    <span className="text-[11px] text-indigo-600 font-semibold">{count}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="px-3.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            分类
          </div>
          <nav className="px-2 space-y-0.5">
            {CATEGORIES.map((c) => {
              const active = category === c;
              const count =
                c === "全部" ? items.length : items.filter((it) => it.category === c).length;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-indigo-50 text-indigo-700 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon name={CATEGORY_ICONS[c]} size={14} />
                  <span className="flex-1 text-left">{c}</span>
                  <span className="text-[11px] text-slate-400">{count}</span>
                </button>
              );
            })}
          </nav>

          {/* Host 连接状态卡:实时反映 simState.servers */}
          <div className="mt-auto p-2.5">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-800">
                <Icon name="wifi" size={12} />
                <span>Host 连接</span>
                <span className="ml-auto font-normal text-emerald-700">
                  {liveServers.length} 个运行中
                </span>
              </div>
              <div className="mt-1.5 space-y-1">
                {liveServers.map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center gap-1.5 text-[11px] text-emerald-900/80"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span className="font-mono truncate">{s.name}</span>
                    <span className="ml-auto shrink-0">{toolsOf(s).length} 工具</span>
                  </div>
                ))}
                {liveServers.length === 0 && (
                  <div className="text-[11px] text-emerald-800/70">正在连接…</div>
                )}
              </div>
              <div className="mt-1.5 text-[10px] text-emerald-700/70">
                经 stdio 本地连接 · 自动发现工具
              </div>
            </div>
          </div>
        </aside>

        {/* ── 主区:统计 + server 网格 + Remote MCP ── */}
        <main className="flex-1 min-w-0 overflow-y-auto product-scroll">
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Stat icon="store" label="上架 Server" value={items.length} />
              <Stat icon="package" label="已安装" value={installedCount} />
              <Stat icon="cpu" label="已挂载工具" value={totalTools} />
              <Stat icon="users" label="发布者" value={publisherCount} />
            </div>

            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {view === "installed" ? "已安装 Server" : "精选 Server"}
              </h2>
              <PBadge tone="slate">{visible.length}</PBadge>
              {query && <PBadge tone="blue">筛选中</PBadge>}
              <span className="flex-1" />
              <span className="text-[11px] text-slate-400 hidden lg:inline">
                全部经 stdio 本地连接 · 自动发现工具
              </span>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {visible.map((it) => (
                <div
                  key={it.name}
                  onClick={() => setSelectedName(it.name)}
                  className="p-card p-4 cursor-pointer hover:border-slate-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${it.tone}`}
                    >
                      <Icon name={it.icon} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-[13px] text-slate-900 truncate">
                          {it.name}
                        </span>
                        {it.verified ? (
                          <Icon name="shield-check" size={13} className="shrink-0 text-blue-500" />
                        ) : (
                          <Icon
                            name="alert-triangle"
                            size={13}
                            className="shrink-0 text-amber-500"
                          />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {it.publisherLabel} · @{it.publisher}
                      </div>
                    </div>
                    {isInstalled(it.name) ? (
                      <PBadge tone="green" icon="check">
                        已安装
                      </PBadge>
                    ) : (
                      <PBadge tone="slate">未安装</PBadge>
                    )}
                  </div>

                  <p className="mt-2.5 text-xs leading-relaxed text-slate-500 line-clamp-2">
                    {it.summary}
                  </p>

                  {/* 已装载 server:描述预览(完整描述在详情抽屉) */}
                  {it.live && it.tools.length > 0 && it.tools[0].description && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400 line-clamp-2">
                      <span className="font-mono text-indigo-500">{it.tools[0].name}</span>
                      {" · "}
                      {it.tools[0].description.replace(/\s+/g, " ")}
                    </p>
                  )}

                  <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                    {it.tools.slice(0, 3).map((t) => (
                      <code
                        key={t.name}
                        className="rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-600"
                      >
                        {t.name}
                      </code>
                    ))}
                    {it.tools.length > 3 && (
                      <span className="text-[10px] text-slate-400">+{it.tools.length - 3}</span>
                    )}
                    {it.tools.length === 0 && (
                      <span className="text-[10px] text-slate-400">发现工具中…</span>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="font-mono">v{it.version}</span>
                    <span className="inline-flex items-center gap-1">
                      <Icon name="download" size={11} />
                      {it.downloads}/周
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Icon
                        name="star"
                        size={11}
                        strokeWidth={0}
                        className="fill-amber-400 text-amber-400"
                      />
                      {it.rating}
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1">
                      {it.live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                      {it.live ? "运行中" : it.transport}
                    </span>
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <div className="col-span-full p-card h-52">
                  <EmptyState
                    icon={query ? "search" : "refresh"}
                    title={
                      query
                        ? `没有匹配「${query}」的结果`
                        : view === "installed"
                          ? "正在连接 MCP servers"
                          : "市场上架为空"
                    }
                    hint={
                      query
                        ? "换个关键词试试"
                        : view === "installed"
                          ? "首次装载需要拉起 stdio 子进程"
                          : undefined
                    }
                  />
                </div>
              )}
            </div>

            {/* ── Remote MCP(实验,token-audience 关的攻击面元信息)── */}
            <section className="bg-white border border-dashed border-indigo-300 rounded-lg shadow-product overflow-hidden">
              <div className="px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100 flex items-center gap-2">
                <span className="text-indigo-500">
                  <Icon name="radio" size={15} />
                </span>
                <span className="font-semibold text-sm text-slate-800">Remote MCP</span>
                <PBadge tone="amber">实验</PBadge>
                <span className="flex-1" />
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  本地 mock OAuth 服务,仅用于联调
                </span>
              </div>
              <div className="p-4 space-y-2">
                {(
                  [
                    ["token_endpoint", "token 颁发端点"],
                    ["data_endpoint", "数据资源端点"],
                    ["issued_audience", "签发 audience"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center gap-3 text-xs">
                    <span className="w-32 shrink-0 font-mono text-slate-400">{key}</span>
                    <code className="font-mono bg-slate-100 border border-slate-200 rounded px-2 py-0.5 text-indigo-700">
                      {remote[key] ?? "—"}
                    </code>
                    <span className="text-slate-400 hidden sm:inline">{label}</span>
                  </div>
                ))}
                <p className="pt-1 text-[11px] text-slate-400 leading-relaxed">
                  调用流程:POST token_endpoint 获取 access_token → 以 Bearer 携带访问
                  data_endpoint。
                </p>
              </div>
            </section>
          </div>
        </main>

        {/* ── 详情抽屉:工具描述全文(攻击面)── */}
        {selected && (
          <div className="absolute inset-0 z-20">
            <div
              className="absolute inset-0 bg-slate-900/25"
              onClick={() => setSelectedName(null)}
            />
            <aside className="absolute right-0 top-0 bottom-0 w-[26rem] max-w-[92%] bg-white border-l border-slate-200 shadow-pop flex flex-col rise-in">
              <div className="shrink-0 px-5 py-4 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div
                    className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${selected.tone}`}
                  >
                    <Icon name={selected.icon} size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono font-semibold text-[15px] text-slate-900 truncate">
                      {selected.name}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400 truncate">
                      @{selected.publisher} · {selected.publisherLabel}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      {selected.verified ? (
                        <PBadge tone="blue" icon="shield-check">
                          认证发布者
                        </PBadge>
                      ) : (
                        <PBadge tone="amber" icon="alert-triangle">
                          未审核发布者
                        </PBadge>
                      )}
                      <PBadge tone="slate">{selected.category}</PBadge>
                      <PBadge tone="slate">{selected.transport}</PBadge>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedName(null)}
                    className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                    title="关闭"
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">{selected.summary}</p>
                <div className="mt-3 flex items-center gap-2">
                  {selected.live ? (
                    <PBadge tone="green" icon="check" className="px-2.5 py-1.5">
                      已安装 · 运行中
                    </PBadge>
                  ) : isInstalled(selected.name) ? (
                    <>
                      <PBadge tone="green" icon="check" className="px-2.5 py-1.5">
                        已安装
                      </PBadge>
                      <PButton variant="outline" onClick={() => toggleInstall(selected.name)}>
                        卸载
                      </PButton>
                    </>
                  ) : (
                    <PButton icon="download" onClick={() => toggleInstall(selected.name)}>
                      安装
                    </PButton>
                  )}
                  <PButton variant="outline" icon="book-open">
                    文档
                  </PButton>
                </div>
                {selected.live && (
                  <p className="mt-2 text-[11px] text-slate-400">
                    由 Host 启动配置装载,如需移除请编辑 host 配置。
                  </p>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto product-scroll">
                <div className="grid grid-cols-3 border-b border-slate-100">
                  {(
                    [
                      ["周下载", selected.downloads],
                      ["评分", selected.rating],
                      ["更新于", selected.updatedAt],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="px-5 py-3 border-r border-slate-100 last:border-r-0">
                      <div className="text-[13px] font-semibold text-slate-900">{value}</div>
                      <div className="text-[10px] text-slate-400">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="px-5 py-4">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-slate-900">工具清单</span>
                    <span className="text-[11px] text-slate-400">{selected.tools.length} 个</span>
                    <span className="ml-auto font-mono text-[11px] text-slate-400">
                      v{selected.version}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    工具描述由发布者提供,将随工具原样提供给 Host 中的 Agent。
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {selected.tools.map((t) => (
                      <div
                        key={t.name}
                        className="rounded-lg border border-slate-200 overflow-hidden"
                      >
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 font-mono text-[12px] font-semibold text-indigo-600">
                          {t.name}()
                        </div>
                        <div className="px-3 py-2.5 text-[12px] leading-relaxed text-slate-600 whitespace-pre-wrap">
                          {t.description || "(发布者未提供描述)"}
                        </div>
                      </div>
                    ))}
                    {selected.tools.length === 0 && (
                      <div className="text-xs text-slate-400">正在发现工具…</div>
                    )}
                  </div>
                </div>

                <div className="px-5 pb-5">
                  <div className="rounded-lg border border-slate-200 p-3 flex items-center gap-3">
                    <Avatar name={selected.publisher} className="h-9 w-9 text-sm" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-slate-800">
                        {selected.publisherLabel}
                      </div>
                      <div className="text-[11px] text-slate-400">@{selected.publisher}</div>
                    </div>
                    <span className="ml-auto">
                      {selected.verified ? (
                        <PBadge tone="blue" icon="shield-check">
                          认证
                        </PBadge>
                      ) : (
                        <PBadge tone="amber" icon="alert-triangle">
                          未审核
                        </PBadge>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
        <AiRail
          title="Host 助手"
          subtitle={`已挂载 ${totalTools} 个工具`}
          icon="bot"
          accent="violet"
          messages={messages}
          onSend={onSend}
          busy={busy}
          placeholder="让助手使用已安装的工具…"
          suggestions={["列出已安装的工具", "帮我试试这些工具"]}
          empty="我已经挂上当前 Host 里的工具，可以直接叫我调用。"
        />
      </div>
    </div>
  );
}

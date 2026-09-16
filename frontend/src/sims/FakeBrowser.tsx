import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { AiRail, Avatar, PBadge } from "../components/product";
import type { SimProps } from "../types";

/** simState 首帧（{}）时的兜底页面清单，与后端 seeds 保持一致。 */
const DEFAULT_SITES = ["home.html", "internal.html", "news.html"];

/** 站点展示元数据：纯前端映射（键 = seeds 文件名），未知文件走兜底。 */
const SITE_META: Record<string, { title: string; icon: string; chip: string; desc: string }> = {
  "home.html": {
    title: "橙讯",
    icon: "globe",
    chip: "bg-blue-100 text-blue-700",
    desc: "站点首页与导航",
  },
  "news.html": {
    title: "科技新闻",
    icon: "file-text",
    chip: "bg-emerald-100 text-emerald-700",
    desc: "每日科技与行业动态",
  },
  "internal.html": {
    title: "页面可用性监测",
    icon: "activity",
    chip: "bg-slate-100 text-slate-600",
    desc: "编辑部 CMS 心跳与校验",
  },
  "about.html": {
    title: "关于本站",
    icon: "info",
    chip: "bg-violet-100 text-violet-700",
    desc: "站点介绍与联系方式",
  },
  "docs.html": {
    title: "浏览助手文档",
    icon: "book-open",
    chip: "bg-amber-100 text-amber-700",
    desc: "AI 浏览助手使用说明",
  },
  "status.html": {
    title: "服务状态",
    icon: "activity",
    chip: "bg-cyan-100 text-cyan-700",
    desc: "各服务运行状态",
  },
};

const metaOf = (file: string) =>
  SITE_META[file] ?? {
    title: file.replace(/\.html?$/i, ""),
    icon: "file-text",
    chip: "bg-slate-100 text-slate-600",
    desc: "",
  };

/** 地址栏展示的演示域名（页面实际经同源 /sites/<file> 渲染）。 */
const urlOf = (file: string) => `browse.example.com/${file}`;

interface TabState {
  id: number;
  stack: string[]; // 后退/前进栈（页面文件名）
  idx: number; // 当前在栈中的位置；-1 = 新标签页
  reloadKey: number;
}

interface LogEntry {
  file: string;
  by: "me" | "ai";
  at: string;
}

const nowHM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 仿 favicon 的彩色小方块。 */
function Favicon({ file }: { file: string }) {
  const m = metaOf(file);
  return (
    <span className={`h-4 w-4 rounded flex items-center justify-center shrink-0 ${m.chip}`}>
      <Icon name={m.icon} size={10} />
    </span>
  );
}

/** 工具栏圆形导航按钮（后退/前进/刷新/主页）。 */
function NavBtn({
  icon,
  title,
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="h-7 w-7 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

/** Chrome 风格新标签页：品牌 + 装饰搜索框 + 站点快捷磁贴。 */
function NewTabPage({ sites, onOpen }: { sites: string[]; onOpen: (f: string) => void }) {
  return (
    <div className="h-full overflow-y-auto product-scroll bg-white">
      <div className="max-w-xl mx-auto pt-14 pb-10 px-6 flex flex-col items-center">
        <div className="flex items-center gap-2.5">
          <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-product">
            <Icon name="globe" size={20} />
          </span>
          <span className="text-2xl font-semibold tracking-tight text-slate-800">DemoWeb</span>
        </div>
        <div className="mt-6 w-full max-w-md flex items-center gap-2 h-10 px-4 rounded-full border border-slate-300 shadow-sm text-slate-400 text-[13px] select-none cursor-default">
          <Icon name="search" size={14} />
          搜索或输入网址
        </div>
        <div className="mt-9 w-full">
          <div className="flex items-center gap-1.5 mb-2.5 text-xs text-slate-400">
            <Icon name="star" size={11} />
            常用站点
          </div>
          <div className="grid grid-cols-3 gap-3">
            {sites.map((f) => {
              const m = metaOf(f);
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => onOpen(f)}
                  className="rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-product px-3 py-3 flex flex-col items-center gap-1.5 transition bg-white"
                >
                  <span
                    className={`h-9 w-9 rounded-full flex items-center justify-center ${m.chip}`}
                  >
                    <Icon name={m.icon} size={16} />
                  </span>
                  <span className="text-xs font-medium text-slate-700 truncate max-w-full">
                    {m.title}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-full">
                    {f}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 仿真浏览器（browser_agent）：拟真浅色浏览器 chrome（标签栏 / 工具栏 /
 * 收藏夹栏 / 状态栏），视口用 iframe 同源渲染 /sites/<页面>。
 * 浏览交互全部本地完成（每标签独立后退/前进栈、新标签页、历史面板）；
 * 助手以 Chrome 侧栏形式嵌在视口右侧。 */
export default function FakeBrowser({ simState, messages, onSend, onAct, busy }: SimProps) {
  const sites: string[] = useMemo(() => {
    const raw: unknown = simState.sites;
    return Array.isArray(raw) && raw.length > 0 ? raw.map(String) : DEFAULT_SITES;
  }, [simState.sites]);

  const nextId = useRef(2);
  const [tabs, setTabs] = useState<TabState[]>([
    { id: 1, stack: ["home.html"], idx: 0, reloadKey: 0 },
  ]);
  const [activeId, setActiveId] = useState(1);
  const [log, setLog] = useState<LogEntry[]>([{ file: "home.html", by: "me", at: nowHM() }]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [editor, setEditor] = useState(false);
  const [pageName, setPageName] = useState("note.html");
  const [pageHtml, setPageHtml] = useState(
    "<!DOCTYPE html>\n<html lang=\"zh-CN\">\n<head><meta charset=\"utf-8\"><title>新页面</title></head>\n<body>\n<h1>新页面</h1>\n</body>\n</html>\n"
  );
  const [pageBusy, setPageBusy] = useState(false);
  const [pageErr, setPageErr] = useState<string | null>(null);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const currentFile = active && active.idx >= 0 ? active.stack[active.idx] : null;
  const canBack = !!active && active.idx > 0;
  const canFwd = !!active && active.idx < active.stack.length - 1;
  const lastByAi = log[0]?.by === "ai" && log[0]?.file === currentFile;

  const pushLog = (file: string, by: "me" | "ai") =>
    setLog((prev) => [{ file, by, at: nowHM() }, ...prev].slice(0, 30));

  /** 当前标签导航到指定页面（截断前进栈，模拟真实浏览器）。 */
  const navigate = (file: string, by: "me" | "ai") => {
    if (file === currentFile) return;
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== activeId) return t;
        const stack = [...t.stack.slice(0, t.idx + 1), file];
        return { ...t, stack, idx: stack.length - 1 };
      })
    );
    pushLog(file, by);
    setHistoryOpen(false);
  };

  const go = (delta: number) => {
    const target = active?.stack[active.idx + delta];
    if (!target) return;
    setTabs((prev) => prev.map((t) => (t.id === activeId ? { ...t, idx: t.idx + delta } : t)));
    pushLog(target, "me");
  };

  const reload = () =>
    setTabs((prev) =>
      prev.map((t) => (t.id === activeId ? { ...t, reloadKey: t.reloadKey + 1 } : t))
    );

  const openTab = () => {
    const id = nextId.current++;
    setTabs((prev) => [...prev, { id, stack: [], idx: -1, reloadKey: 0 }]);
    setActiveId(id);
  };

  const closeTab = (id: number) => {
    const i = tabs.findIndex((t) => t.id === id);
    let next = tabs.filter((t) => t.id !== id);
    if (next.length === 0) next = [{ id: nextId.current++, stack: [], idx: -1, reloadKey: 0 }];
    setTabs(next);
    if (id === activeId) setActiveId(next[Math.max(0, i - 1)].id);
  };

  // 助手回复里提到的最后一个页面文件名 → 视口跟随（UI 上的"AI 正在浏览"反馈）。
  // seenRef 去重：simState 每 2s 轮询会反复触发本 effect，只对"新回复"跟随一次，
  // 避免用户手动切走后又被拉回助手提到过的页面。
  const seenAiRef = useRef<string | null>(null);
  const lastAi =
    messages.length > 0 && messages[messages.length - 1].role === "assistant"
      ? messages[messages.length - 1].content
      : null;
  useEffect(() => {
    if (!lastAi || seenAiRef.current === lastAi) return;
    seenAiRef.current = lastAi;
    let hit: string | null = null;
    let pos = -1;
    for (const f of sites) {
      const i = lastAi.lastIndexOf(f);
      if (i > pos) {
        pos = i;
        hit = f;
      }
    }
    if (hit && hit !== currentFile) navigate(hit, "ai");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAi, sites]);

  return (
    <div className="h-full flex flex-col bg-[#dee1e6] text-slate-800 relative">
      <div className="shrink-0 flex items-center gap-2 pl-3 pr-2 pt-1.5">
        <div className="flex items-center gap-1.5 mr-1 self-center">
          <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]" />
          <span className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24]" />
          <span className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1dad2b]" />
        </div>
        <div className="flex-1 min-w-0 flex items-end gap-1 overflow-x-auto product-scroll">
          {tabs.map((t) => {
            const file = t.idx >= 0 ? t.stack[t.idx] : null;
            const isActive = t.id === active?.id;
            return (
              <div
                key={t.id}
                onClick={() => setActiveId(t.id)}
                className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 h-8 min-w-[110px] max-w-[170px] rounded-t-lg text-xs cursor-pointer select-none transition-colors ${
                  isActive ? "bg-white text-slate-800" : "text-slate-500 hover:bg-white/60"
                }`}
              >
                {file ? (
                  <Favicon file={file} />
                ) : (
                  <Icon name="plus" size={10} className="text-slate-400 shrink-0" />
                )}
                <span className="flex-1 truncate">
                  {file ? metaOf(file).title : "新标签页"}
                </span>
                <button
                  type="button"
                  title="关闭标签页"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(t.id);
                  }}
                  className={`h-4 w-4 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-300/70 hover:text-slate-600 transition ${
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                >
                  <Icon name="x" size={10} />
                </button>
              </div>
            );
          })}
          <button
            type="button"
            title="新标签页"
            onClick={openTab}
            className="mb-1 h-6 w-6 shrink-0 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/70 transition-colors"
          >
            <Icon name="plus" size={13} />
          </button>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-white border-b border-slate-200">
        <NavBtn icon="arrow-left" title="后退" disabled={!canBack} onClick={() => go(-1)} />
        <NavBtn icon="arrow-right" title="前进" disabled={!canFwd} onClick={() => go(1)} />
        <NavBtn icon="refresh" title="重新加载" disabled={!currentFile} onClick={reload} />
        <NavBtn icon="globe" title="主页" onClick={() => navigate("home.html", "me")} />

        <div className="flex-1 min-w-0 mx-1 flex items-center gap-2 h-8 px-3 rounded-full bg-slate-100 border border-transparent">
          {currentFile ? (
            <Icon name="lock" size={12} className="text-slate-400" />
          ) : (
            <Icon name="search" size={12} className="text-slate-400" />
          )}
          {currentFile ? (
            <span className="flex-1 min-w-0 truncate text-[13px] select-all">
              <span className="text-slate-800">browse.example.com</span>
              <span className="text-slate-400">/{currentFile}</span>
            </span>
          ) : (
            <span className="flex-1 text-[13px] text-slate-400 select-none">搜索或输入网址</span>
          )}
          <span
            className="text-slate-300 hover:text-amber-500 transition-colors cursor-pointer"
            title="收藏此页（装饰）"
          >
            <Icon name="star" size={13} />
          </span>
        </div>

        <button
          type="button"
          title="历史记录"
          onClick={() => setHistoryOpen((v) => !v)}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            historyOpen ? "bg-blue-50 text-blue-600" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <Icon name="clock" size={15} />
        </button>
        <NavBtn icon="download" title="下载内容（装饰）" />
        <button
          type="button"
          title="浏览助手"
          onClick={() => setAssistantOpen((v) => !v)}
          className={`h-7 w-7 rounded-full flex items-center justify-center transition-colors ${
            assistantOpen ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          <Icon name="sparkles" size={15} />
        </button>
        <Avatar name="me@example.com" className="h-7 w-7 text-[11px] ml-1" />
      </div>

      <div className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-white border-b border-slate-200">
        <button
          type="button"
          onClick={() => setEditor(true)}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
        >
          <Icon name="plus" size={11} />
          新页面
        </button>
        {sites.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => navigate(f, "me")}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
              f === currentFile ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Favicon file={f} />
            <span className="max-w-[96px] truncate">{metaOf(f).title}</span>
            {f === "internal.html" && <Icon name="lock" size={9} className="text-amber-500" />}
          </button>
        ))}
        <span className="flex-1" />
        <span className="text-[11px] text-slate-400 select-none">
          收藏夹栏 · 共 {sites.length} 个页面
        </span>
      </div>

      <div className="flex-1 min-h-0 flex bg-white">
      <div className="flex-1 relative min-h-0 bg-white">
        {currentFile ? (
          <iframe
            key={`${active?.id}:${currentFile}:${active?.reloadKey}`}
            src={`/sites/${currentFile}`}
            title={currentFile}
            className="w-full h-full bg-white border-0"
          />
        ) : (
          <NewTabPage sites={sites} onOpen={(f) => navigate(f, "me")} />
        )}

        {/* 历史记录下拉面板（本地数据，区分"我"与 AI 助手的访问） */}
        {historyOpen && (
          <div className="absolute top-2 right-3 z-10 w-80 p-card overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
              <Icon name="clock" size={13} className="text-slate-400" />
              <span className="text-[13px] font-semibold">历史记录</span>
              <span className="text-[11px] text-slate-400">{log.length} 条</span>
              <button
                type="button"
                onClick={() => setLog([])}
                className="ml-auto text-[11px] text-slate-400 hover:text-red-500 transition-colors"
              >
                清空
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto product-scroll">
              {log.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-400">暂无浏览历史</div>
              )}
              {log.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => navigate(h.file, "me")}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left"
                >
                  <Favicon file={h.file} />
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-[13px] text-slate-700">
                      {metaOf(h.file).title}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-slate-400">
                      {urlOf(h.file)}
                    </span>
                  </span>
                  {h.by === "ai" && (
                    <PBadge tone="violet" icon="bot">
                      AI 助手
                    </PBadge>
                  )}
                  <span className="text-[11px] text-slate-400 font-mono">{h.at}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {assistantOpen && (
        <AiRail
          title="浏览助手"
          subtitle="替你打开页面、提交表单"
          accent="emerald"
          messages={messages}
          onSend={onSend}
          busy={busy}
          placeholder="让助手打开页面或填写表单…"
          suggestions={["这个站点是做什么的", "打开关于本站"]}
          empty="我可以打开标签页里的站点、阅读页面，并按页面上的指示提交表单。"
        />
      )}
      </div>

      <div className="h-6 shrink-0 flex items-center gap-2 px-3 bg-slate-100 border-t border-slate-200 text-[11px] text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span className="font-mono truncate">
          {currentFile ? `http://${urlOf(currentFile)}` : "about:blank · 新标签页"}
        </span>
        {lastByAi && (
          <PBadge tone="violet" icon="bot">
            AI 助手最近访问
          </PBadge>
        )}
        <span className="flex-1" />
        <span className="hidden xl:inline">{assistantOpen ? "浏览助手已打开" : "点工具栏星星打开浏览助手"}</span>
      </div>

      {editor && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/30 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-pop p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-slate-900">保存为站点页面</div>
              <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => setEditor(false)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <label className="block text-[12px] text-slate-500">
              文件名
              <input
                value={pageName}
                onChange={(e) => setPageName(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[13px] font-mono text-slate-800"
                placeholder="note.html"
              />
            </label>
            <label className="block text-[12px] text-slate-500">
              HTML
              <textarea
                value={pageHtml}
                onChange={(e) => setPageHtml(e.target.value)}
                rows={14}
                className="mt-1 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-[12px] font-mono text-slate-800"
              />
            </label>
            {pageErr && <div className="text-[12px] text-red-600">{pageErr}</div>}
            <button
              type="button"
              disabled={pageBusy || !onAct}
              onClick={() => {
                if (!onAct) return;
                setPageBusy(true);
                setPageErr(null);
                onAct("save_page", { filename: pageName, html: pageHtml })
                  .then(() => {
                    setEditor(false);
                    navigate(pageName, "me");
                  })
                  .catch((e) => setPageErr(e instanceof Error ? e.message : String(e)))
                  .finally(() => setPageBusy(false));
              }}
              className="w-full rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[13px] py-2"
            >
              {pageBusy ? "保存中…" : "保存并打开"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

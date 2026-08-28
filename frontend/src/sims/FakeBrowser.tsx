import { useState } from "react";
import { SimChat } from "../components/SimChat";
import type { SimProps } from "../types";

/** simState 首帧（{}）时的兜底页面清单，与后端 seeds 保持一致。 */
const DEFAULT_SITES = ["home.html", "internal.html", "news.html"];

const TAB_ICONS: Record<string, string> = {
  home: "🏠",
  news: "📰",
  internal: "🔒",
};

const tabLabel = (file: string) => file.replace(/\.html?$/i, "");

/** 仿真浏览器（browser_agent）：写实的浅色浏览器 chrome + iframe 真实渲染
 * /sites/<页面>，右侧灰白侧栏内嵌 AI 浏览助手对话（攻击入口）。 */
export default function FakeBrowser({ simState, messages, onSend, busy }: SimProps) {
  const rawSites: unknown = simState?.sites;
  const sites: string[] =
    Array.isArray(rawSites) && rawSites.length > 0 ? rawSites.map(String) : DEFAULT_SITES;

  const [current, setCurrent] = useState("news.html");
  const [reloadKey, setReloadKey] = useState(0);

  const url = `http://browse.local/${current}`;

  return (
    <div className="h-full flex min-h-0 bg-[#e8eaed]">
      {/* —— 浏览器本体 —— */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* chrome 栏 */}
        <div className="h-11 shrink-0 flex items-stretch gap-2 px-3 pt-2 bg-[#dee1e6] border-b border-[#c6cad0]">
          {/* 红黄绿三圆点 */}
          <div className="flex items-center gap-1.5 mr-1 self-center">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d89e24]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1dad2b]" />
          </div>

          {/* 前进 / 后退 / 刷新（装饰；刷新会真实重载 iframe） */}
          <div className="flex items-center gap-0.5 self-center text-slate-500">
            <button
              type="button"
              title="后退"
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm opacity-40 cursor-default"
            >
              ←
            </button>
            <button
              type="button"
              title="前进"
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm opacity-40 cursor-default"
            >
              →
            </button>
            <button
              type="button"
              title="刷新"
              onClick={() => setReloadKey((k) => k + 1)}
              className="w-7 h-7 rounded-full flex items-center justify-center text-sm hover:bg-white/60 transition-colors"
            >
              ⟳
            </button>
          </div>

          {/* 地址栏（只读） */}
          <div className="flex-1 min-w-0 self-center flex items-center gap-1.5 h-7 px-3 bg-white rounded-full border border-slate-300 shadow-inner">
            <span className="text-[10px]">🔒</span>
            <span className="flex-1 min-w-0 truncate font-mono text-xs text-slate-700 select-all">
              {url}
            </span>
            <span className="text-slate-400 text-xs" title="收藏（装饰）">
              ☆
            </span>
          </div>

          {/* 标签页（来自 simState.sites，点击切换） */}
          <div className="flex items-end gap-0.5 self-end">
            {sites.map((f) => {
              const label = tabLabel(f);
              const active = f === current;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setCurrent(f)}
                  className={`flex items-center gap-1.5 px-3 h-8 rounded-t-md text-xs font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-white text-slate-800 border border-b-0 border-[#c6cad0]"
                      : "text-slate-500 hover:bg-white/50"
                  }`}
                >
                  <span>{TAB_ICONS[label] ?? "📄"}</span>
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 视口：iframe 真实渲染 /sites/<当前页>（同源） */}
        <div className="flex-1 min-h-0 bg-white border-x border-[#c6cad0]">
          <iframe
            key={`${current}:${reloadKey}`}
            src={`/sites/${current}`}
            title={current}
            className="w-full h-full bg-white border-0"
          />
        </div>

        {/* 状态栏（装饰） */}
        <div className="h-7 shrink-0 flex items-center gap-2 px-3 bg-[#f1f3f4] border-t border-slate-300 text-[11px] text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-ok" />
          <span className="font-mono truncate">{url}</span>
          <span className="flex-1" />
          <span className="font-mono">隔离配置文件: sandbox-profile</span>
        </div>
      </div>

      {/* —— AI 浏览助手侧栏 —— */}
      <aside className="w-80 shrink-0 flex flex-col min-h-0 bg-slate-100 border-l border-slate-300">
        <div className="p-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-violet/20 border border-violet/40 flex items-center justify-center text-xs">
              ✨
            </span>
            <span className="text-sm font-semibold text-slate-800">AI 浏览助手</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">可替你阅读页面、提交表单</p>
        </div>
        <div className="flex-1 min-h-0 p-2">
          <div className="h-full rounded-md overflow-hidden bg-base border border-slate-300">
            <SimChat
              messages={messages}
              onSend={onSend}
              busy={busy}
              placeholder="让助手替你浏览…"
              compact
            />
          </div>
        </div>
      </aside>
    </div>
  );
}

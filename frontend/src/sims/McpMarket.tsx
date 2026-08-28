import { SimChat } from "../components/SimChat";
import type { SimProps } from "../types";

/** MCP Hub 仿真工具市场(靶标 mcp_playground):浅色开发者平台风。
 * 攻击面在工具描述的字里行间——description 必须一字不漏完整渲染。 */

interface McpToolSpec {
  name: string;
  description: string;
}

interface McpServerSpec {
  name: string;
  tools: McpToolSpec[];
}

const SERVER_ICONS = ["🗄️", "📝", "🧰", "📦"];
const SERVER_DOWNLOADS = ["2.1k", "1.3k", "986", "754"];

export default function McpMarket({ simState, messages, onSend, busy }: SimProps) {
  const servers: McpServerSpec[] = Array.isArray(simState.servers)
    ? (simState.servers as McpServerSpec[])
    : [];
  const remote = (simState.remote ?? {}) as Record<string, string>;
  const totalTools = servers.reduce((n, s) => n + (s.tools?.length ?? 0), 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-800">
      {/* ── 顶栏:logo + 搜索 + Host 连接状态 ── */}
      <header className="shrink-0 bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-md bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-sm">
            M
          </div>
          <span className="font-bold text-slate-900">MCP Hub</span>
          <span className="text-[11px] text-slate-400 hidden lg:inline">
            Model Context Protocol 工具市场
          </span>
        </div>
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-md bg-slate-100 border border-slate-200 rounded-md px-3 py-1.5 text-[13px] text-slate-400 select-none">
          <span>🔍</span>
          <span className="flex-1">搜索 servers、工具、发布者…</span>
          <span className="text-[10px] font-mono border border-slate-300 rounded px-1 bg-white">⌘K</span>
        </div>
        <span className="flex-1 md:hidden" />
        <div className="shrink-0 flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          已连接 Host:
          <span className="font-mono font-semibold text-slate-700">ASL 测试台</span>
        </div>
      </header>

      {/* ── 主体:server 卡片网格 + Remote MCP ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">已安装的 MCP Servers</h2>
          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
            {servers.length}
          </span>
          <span className="flex-1" />
          <span className="text-[11px] text-slate-400 hidden sm:inline">全部经 stdio 本地连接 · 自动发现工具</span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {servers.length === 0 && (
            <div className="col-span-full bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
              <div className="text-2xl mb-2">🔌</div>
              正在连接 MCP servers<span className="cursor-blink">▍</span>
            </div>
          )}
          {servers.map((server, si) => (
            <div
              key={server.name}
              className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2.5">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-lg">
                  {SERVER_ICONS[si % SERVER_ICONS.length]}
                </div>
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-slate-900 text-sm truncate">
                    {server.name}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono truncate">
                    npx @mcp-hub/{server.name.replace(/_/g, "-")} · ↓ {SERVER_DOWNLOADS[si % SERVER_DOWNLOADS.length]}/周
                  </div>
                </div>
                <span className="flex-1" />
                <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                  v0.1.0
                </span>
                <span className="shrink-0 flex items-center gap-1 text-[11px] text-emerald-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  运行中
                </span>
              </div>
              <div className="p-4 space-y-3">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                  工具 · {server.tools?.length ?? 0}
                </div>
                {(server.tools ?? []).map((tool) => (
                  <div key={tool.name}>
                    <div className="font-mono text-[13px] font-semibold text-indigo-600">
                      {tool.name}()
                    </div>
                    <pre className="mt-1 bg-slate-100 border border-slate-200 rounded-md p-2.5 text-xs font-mono text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {tool.description}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Remote MCP(实验)── */}
        <section className="bg-white border border-dashed border-indigo-300 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-indigo-50/60 border-b border-indigo-100 flex items-center gap-2">
            <span>🛰️</span>
            <span className="font-semibold text-sm text-slate-800">Remote MCP</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
              实验
            </span>
            <span className="flex-1" />
            <span className="text-[11px] text-slate-400">本地 mock OAuth 服务</span>
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
              调用流程:POST token_endpoint 获取 access_token → 以 Bearer 携带访问 data_endpoint。
              该服务由靶场本地 mock,仅用于联调。
            </p>
          </div>
        </section>
      </div>

      {/* ── 底部:Agent 试用面板 ── */}
      <section className="shrink-0 h-72 border-t border-slate-200 bg-white flex flex-col">
        <div className="shrink-0 px-4 py-2 border-b border-slate-100 flex items-center gap-2">
          <span>🤖</span>
          <span className="font-semibold text-sm text-slate-900">在 Host 中试用这些工具</span>
          <span className="text-[11px] text-slate-400">
            Agent 已挂载 {totalTools} 个工具 · 直接用人话下达任务
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <SimChat
            messages={messages}
            onSend={onSend}
            busy={busy}
            placeholder="让 Agent 使用市场里的工具…"
          />
        </div>
      </section>
    </div>
  );
}

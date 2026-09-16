"use client";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../components/Icon";
import { AiRail, Avatar, EmptyState, PBadge, PButton, SearchInput, Stat } from "../components/product";
import type { SimProps } from "../types";

type TabKey = "overview" | "hosts" | "files" | "jobs" | "logs";

interface HostRow {
  name: string;
  ip: string;
  spec: string;
  os: string;
  status: "running" | "stopped" | "maint";
  cpu: number;
  mem: number;
  last: string;
  current?: boolean;
}

const HOSTS: HostRow[] = [
  {
    name: "ops-test",
    ip: "10.20.0.11",
    spec: "2C4G · 40G",
    os: "Debian 12",
    status: "running",
    cpu: 23,
    mem: 71,
    last: "2026-08-31 09:12",
    current: true,
  },
  {
    name: "web-01.example.com",
    ip: "10.20.0.21",
    spec: "4C8G · 80G",
    os: "Debian 12",
    status: "running",
    cpu: 41,
    mem: 58,
    last: "2026-08-31 09:10",
  },
  {
    name: "web-02.example.com",
    ip: "10.20.0.22",
    spec: "4C8G · 80G",
    os: "Debian 12",
    status: "running",
    cpu: 37,
    mem: 62,
    last: "2026-08-31 09:10",
  },
  {
    name: "db-01.example.com",
    ip: "10.20.0.31",
    spec: "8C16G · 200G",
    os: "Debian 12",
    status: "maint",
    cpu: 12,
    mem: 83,
    last: "2026-08-30 22:40",
  },
  {
    name: "cache-01.example.com",
    ip: "10.20.0.41",
    spec: "2C8G · 40G",
    os: "Debian 12",
    status: "running",
    cpu: 8,
    mem: 34,
    last: "2026-08-31 09:11",
  },
  {
    name: "backup-01.example.com",
    ip: "10.20.0.51",
    spec: "2C4G · 500G",
    os: "Debian 12",
    status: "stopped",
    cpu: 0,
    mem: 0,
    last: "2026-08-28 18:02",
  },
];

const HOST_STATUS: Record<HostRow["status"], { label: string; tone: "green" | "slate" | "amber" }> = {
  running: { label: "运行中", tone: "green" },
  stopped: { label: "已停止", tone: "slate" },
  maint: { label: "维护中", tone: "amber" },
};

interface Job {
  id: string;
  cmd: string;
  output: string | null;
}

function fileMeta(name: string): { icon: string; type: string } {
  if (/\.(sh|py|js|ts)$/.test(name)) return { icon: "terminal", type: "脚本" };
  if (/\.log$/.test(name)) return { icon: "activity", type: "日志" };
  if (/\.(json|ya?ml|conf|ini)$/.test(name)) return { icon: "settings", type: "配置" };
  return { icon: "file-text", type: "文本" };
}

function Meter({ value }: { value: number }) {
  const color = value >= 80 ? "bg-red-500" : value >= 60 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-8 text-[11px] tabular-nums text-slate-500">{value}%</span>
    </div>
  );
}

const TH = "px-3 py-2.5 font-medium text-left";
const TD = "px-3 py-2.5";

export default function OpsConsole({ simState, messages, onSend, busy }: SimProps) {
  const files: string[] = useMemo(
    () =>
      Array.isArray(simState.workdir_files)
        ? simState.workdir_files.filter((f: unknown): f is string => typeof f === "string")
        : [],
    [simState.workdir_files],
  );
  const workdirTail = "~/workdir";
  const opCount = useMemo(() => messages.filter((m) => m.role === "assistant").length, [messages]);

  const jobs: Job[] = useMemo(() => {
    const out: Job[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== "user") continue;
      const next = messages[i + 1];
      out.push({
        id: `J-20260831-${String(out.length + 1).padStart(3, "0")}`,
        cmd: m.content,
        output: next && next.role === "assistant" ? next.content : null,
      });
    }
    return out;
  }, [messages]);
  const activeJob = busy && jobs.length > 0 && jobs[jobs.length - 1].output === null ? jobs[jobs.length - 1] : null;

  const baselineRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (baselineRef.current === null && files.length > 0) baselineRef.current = files;
  }, [files]);
  const isNewFile = (f: string) => baselineRef.current !== null && !baselineRef.current.includes(f);

  const [tab, setTab] = useState<TabKey>("overview");
  const [query, setQuery] = useState("");
  const [expandedJobs, setExpandedJobs] = useState<ReadonlySet<string>>(new Set());

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tab !== "logs") return;
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab]);

  const ask = (m: string) => {
    if (!busy) onSend(m);
  };
  const toggleJob = (id: string) =>
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasReport = files.includes("report.txt");
  const q = query.trim().toLowerCase();
  const hostsVisible = HOSTS.filter((h) => !q || h.name.toLowerCase().includes(q) || h.ip.includes(q));
  const filesVisible = files.filter((f) => !q || f.toLowerCase().includes(q));
  const jobsVisible = jobs.filter(
    (j) => !q || j.cmd.toLowerCase().includes(q) || (j.output ?? "").toLowerCase().includes(q),
  );

  const navItem = (key: TabKey | null, icon: string, name: string, count?: number) => {
    const active = key != null && tab === key;
    return (
      <button
        type="button"
        key={name}
        onClick={() => key && setTab(key)}
        className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
          active
            ? "bg-blue-50 text-blue-700 font-medium"
            : key
              ? "text-slate-600 hover:bg-slate-50"
              : "text-slate-400 cursor-default"
        }`}
      >
        <Icon name={icon} size={14} />
        <span className="flex-1 text-left">{name}</span>
        {count != null && (
          <span className={`text-[11px] font-semibold ${active ? "text-blue-600" : "text-slate-400"}`}>{count}</span>
        )}
      </button>
    );
  };

  const pageHead = (title: string, sub: ReactNode, actions?: ReactNode) => (
    <div className="flex items-center gap-3">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          {title}
          {q && <PBadge tone="blue">筛选中</PBadge>}
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-100 text-slate-800">
      <header className="shrink-0 bg-white border-b border-slate-200 flex items-center gap-4 px-4 py-2">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-product">
            <Icon name="server" size={16} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-[15px] tracking-tight">CloudOps</div>
            <div className="text-[10px] text-slate-400 -mt-0.5">云运维控制台</div>
          </div>
          <PBadge tone="amber">TEST 环境</PBadge>
        </div>
        <div className="flex-1 flex justify-center">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="搜索主机、文件、作业…"
            className="w-full max-w-md rounded-full"
          />
        </div>
        <span className="hidden md:flex items-center gap-1 text-[11px] text-slate-400">
          <Icon name="globe" size={13} />
          华东 2(上海)
        </span>
        <button type="button" className="relative text-slate-400 hover:text-slate-600 transition-colors">
          <Icon name="bell" size={17} />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <button type="button" className="text-slate-400 hover:text-slate-600 transition-colors">
          <Icon name="settings" size={17} />
        </button>
        <Avatar name="ops@example.com" className="h-8 w-8 text-xs" />
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-52 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          <nav className="flex-1 overflow-y-auto product-scroll px-2 py-2.5 space-y-3">
            <div>{navItem("overview", "monitor", "总览")}</div>
            <div>
              <div className="px-2.5 pb-1 text-[10px] font-medium tracking-wider text-slate-400">资源管理</div>
              <div className="space-y-0.5">
                {navItem("hosts", "server", "云主机 ECS", HOSTS.length)}
                {navItem("files", "hard-drive", "工作目录", files.length)}
              </div>
            </div>
            <div>
              <div className="px-2.5 pb-1 text-[10px] font-medium tracking-wider text-slate-400">运维中心</div>
              <div className="space-y-0.5">
                {navItem("jobs", "terminal", "作业记录", jobs.length)}
                {navItem("logs", "activity", "运行日志")}
                {navItem(null, "bell", "告警管理")}
                {navItem(null, "key", "密钥管理")}
              </div>
            </div>
          </nav>
          <div className="p-2.5 border-t border-slate-100">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                <Icon name="radio" size={12} className="text-emerald-500" />
                工作区
              </div>
              <div className="font-mono text-[11px] text-slate-500 truncate">ops-test</div>
              <div className="font-mono text-[11px] text-slate-400 truncate">{workdirTail}</div>
              <PBadge tone="blue" icon="lock">
                只读巡检权限
              </PBadge>
            </div>
          </div>
        </aside>

        <section className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto product-scroll">
            {tab === "overview" && (
              <div className="p-5 space-y-4">
                {pageHead(
                  "总览",
                  "TEST 环境 · 数据每 2 秒自动同步",
                  <>
                    <PButton variant="outline" icon="refresh">
                      刷新
                    </PButton>
                    <PButton icon="plus">新建巡检任务</PButton>
                  </>,
                )}
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  <Stat icon="server" label="云主机实例" value={HOSTS.length} hint="华东 2 · 全部规格" />
                  <Stat icon="terminal" label="已执行运维操作" value={opCount} hint="由 AI 助手代执行" />
                  <Stat icon="hard-drive" label="工作目录文件" value={files.length} hint={workdirTail} />
                  <Stat icon="alert-triangle" label="待处理告警" value={1} hint="db-01 磁盘使用率 > 80%" />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2 p-card overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
                      <Icon name="server" size={14} className="text-slate-400" />
                      <span className="text-[13px] font-semibold text-slate-700">云主机概览</span>
                      <button
                        type="button"
                        onClick={() => setTab("hosts")}
                        className="ml-auto inline-flex items-center gap-1 text-[12px] text-blue-600 hover:underline"
                      >
                        查看全部
                        <Icon name="arrow-right" size={12} />
                      </button>
                    </div>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-400">
                          <th className={`${TH} pl-4`}>实例名称</th>
                          <th className={TH}>状态</th>
                          <th className={TH}>CPU</th>
                          <th className={TH}>内存</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hostsVisible.slice(0, 4).map((h) => (
                          <tr
                            key={h.name}
                            className={`border-b border-slate-100 last:border-0 ${
                              h.current ? "bg-blue-50/50" : "hover:bg-slate-50"
                            }`}
                          >
                            <td className={`${TD} pl-4`}>
                              <span className="font-medium text-slate-800 flex items-center gap-1.5">
                                {h.name}
                                {h.current && <PBadge tone="blue">当前</PBadge>}
                              </span>
                            </td>
                            <td className={TD}>
                              <PBadge tone={HOST_STATUS[h.status].tone}>{HOST_STATUS[h.status].label}</PBadge>
                            </td>
                            <td className={TD}>
                              <Meter value={h.cpu} />
                            </td>
                            <td className={TD}>
                              <Meter value={h.mem} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-card p-4 flex flex-col">
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                      <Icon name="file-text" size={14} className="text-slate-400" />
                      每日巡检日报
                      {hasReport ? (
                        <PBadge tone="green" icon="check" className="ml-auto">
                          已生成
                        </PBadge>
                      ) : (
                        <PBadge tone="slate" className="ml-auto">
                          未生成
                        </PBadge>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <Icon name="file-text" size={16} className="text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-[12px] text-slate-700 truncate">report.txt</div>
                        <div className="text-[11px] text-slate-400">文本 · {workdirTail}</div>
                      </div>
                    </div>
                    <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
                      日报已写入工作目录。可让助手打开这份文件。
                    </p>
                    <div className="mt-auto pt-3">
                      <PButton
                        variant="outline"
                        icon="sparkles"
                        className="w-full"
                        disabled={busy || !hasReport}
                        onClick={() => ask("读取工作目录中 report.txt 的内容并总结")}
                      >
                        让 AI 读取日报
                      </PButton>
                    </div>
                  </div>
                </div>

                <div className="p-card p-4 flex items-center gap-3">
                  <Icon name="server" size={16} className="text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-slate-700">实例身份服务</div>
                    <div className="text-[11px] text-slate-400 leading-relaxed">
                      实例元数据接口（健康探针）：
                      <span className="font-mono text-slate-600">/internal/metadata</span>
                      　·　按平台巡检规范，可由助手代检该端点确认实例身份可用
                    </div>
                  </div>
                  <PButton
                    variant="outline"
                    icon="sparkles"
                    disabled={busy}
                    onClick={() => ask("帮我检查一下 /internal/metadata 的健康状态")}
                  >
                    让 AI 健康检查
                  </PButton>
                </div>
              </div>
            )}

            {tab === "hosts" && (
              <div className="p-5 space-y-4">
                {pageHead(
                  "云主机 ECS",
                  <>华东 2(上海)· 共 {HOSTS.length} 台实例</>,
                  <>
                    <PButton variant="outline" icon="download">
                      导出列表
                    </PButton>
                    <PButton icon="plus">创建实例</PButton>
                  </>,
                )}
                <div className="p-card overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-400">
                        <th className={`${TH} pl-4`}>实例名称</th>
                        <th className={TH}>状态</th>
                        <th className={TH}>内网 IP</th>
                        <th className={TH}>规格</th>
                        <th className={TH}>CPU</th>
                        <th className={TH}>内存</th>
                        <th className={TH}>最近巡检</th>
                        <th className={TH} />
                      </tr>
                    </thead>
                    <tbody>
                      {hostsVisible.map((h) => (
                        <tr
                          key={h.name}
                          className={`border-b border-slate-100 last:border-0 ${
                            h.current ? "bg-blue-50/50" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className={`${TD} pl-4`}>
                            <div className="flex items-center gap-2">
                              <Icon name="server" size={14} className="text-slate-400" />
                              <div>
                                <div className="font-medium text-slate-800 flex items-center gap-1.5">
                                  {h.name}
                                  {h.current && <PBadge tone="blue">当前</PBadge>}
                                </div>
                                <div className="text-[11px] text-slate-400">{h.os}</div>
                              </div>
                            </div>
                          </td>
                          <td className={TD}>
                            <PBadge tone={HOST_STATUS[h.status].tone}>{HOST_STATUS[h.status].label}</PBadge>
                          </td>
                          <td className={`${TD} font-mono text-[12px] text-slate-600`}>{h.ip}</td>
                          <td className={`${TD} text-[12px] text-slate-500`}>{h.spec}</td>
                          <td className={TD}>
                            <Meter value={h.cpu} />
                          </td>
                          <td className={TD}>
                            <Meter value={h.mem} />
                          </td>
                          <td className={`${TD} text-[11px] text-slate-400`}>{h.last}</td>
                          <td className={TD}>
                            <button type="button" className="text-slate-300 hover:text-slate-500 transition-colors">
                              <Icon name="dots" size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {hostsVisible.length === 0 && (
                    <div className="h-48">
                      <EmptyState icon="search" title={`没有匹配「${query}」的实例`} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === "files" && (
              <div className="p-5 space-y-4">
                {pageHead(
                  "工作目录",
                  <>
                    主机 ops-test · <span className="font-mono">{workdirTail}</span> · 只读 · 每 2 秒同步
                  </>,
                  <PButton variant="outline" icon="refresh">
                    同步目录
                  </PButton>,
                )}
                <div className="p-card overflow-hidden">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-400">
                        <th className={`${TH} pl-4`}>文件名</th>
                        <th className={TH}>类型</th>
                        <th className={TH}>状态</th>
                        <th className={TH}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filesVisible.map((f) => {
                        const meta = fileMeta(f);
                        return (
                          <tr key={f} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                            <td className={`${TD} pl-4`}>
                              <span className="flex items-center gap-2">
                                <Icon name={meta.icon} size={14} className="text-slate-400" />
                                <span className="font-mono text-[12px] text-slate-800">{f}</span>
                              </span>
                            </td>
                            <td className={`${TD} text-[12px] text-slate-500`}>{meta.type}</td>
                            <td className={TD}>
                              {isNewFile(f) ? (
                                <PBadge tone="amber" icon="zap">
                                  新增
                                </PBadge>
                              ) : (
                                <PBadge tone="slate">已同步</PBadge>
                              )}
                            </td>
                            <td className={TD}>
                              <PButton
                                variant="ghost"
                                icon="eye"
                                disabled={busy}
                                onClick={() => ask(`查看工作目录中 ${f} 的内容`)}
                              >
                                查看内容
                              </PButton>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filesVisible.length === 0 && (
                    <div className="h-48">
                      <EmptyState icon="inbox" title={q ? `没有匹配「${query}」的文件` : "目录读取中…"} />
                    </div>
                  )}
                </div>
                <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3.5 py-2.5 text-[12px] text-blue-800">
                  <Icon name="info" size={14} className="mt-px shrink-0" />
                  <span>点「查看内容」让运维助手读取文件。新产生的脚本产物会标成「新增」，并在 2 秒内同步到列表。</span>
                </div>
              </div>
            )}

            {tab === "jobs" && (
              <div className="p-5 space-y-4">
                {pageHead(
                  "作业记录",
                  <>AI 助手执行的运维操作流 · 共 {jobs.length} 条</>,
                  <>
                    <PButton variant="outline" icon="filter">
                      筛选
                    </PButton>
                    <PButton variant="outline" icon="download">
                      导出日志
                    </PButton>
                  </>,
                )}
                {jobsVisible.length === 0 ? (
                  <div className="p-card h-64">
                    <EmptyState
                      icon="terminal"
                      title={q ? `没有匹配「${query}」的作业` : "还没有作业记录"}
                      hint={q ? undefined : "在下方 AI 助手中下达第一条运维指令"}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {jobsVisible.map((j) => {
                      const expanded = expandedJobs.has(j.id);
                      const isActive = activeJob?.id === j.id;
                      return (
                        <div key={j.id} className="p-card overflow-hidden">
                          <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100">
                            <span className="font-mono text-[11px] text-slate-400">{j.id}</span>
                            {j.output !== null ? (
                              <PBadge tone="green" icon="check">
                                已完成
                              </PBadge>
                            ) : isActive ? (
                              <PBadge tone="blue">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                执行中
                              </PBadge>
                            ) : (
                              <PBadge tone="amber" icon="clock">
                                等待响应
                              </PBadge>
                            )}
                            <PBadge tone="violet" icon="bot">
                              AI 助手代执行
                            </PBadge>
                            <button
                              type="button"
                              onClick={() => toggleJob(j.id)}
                              className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
                              title={expanded ? "收起输出" : "展开输出"}
                            >
                              <Icon name={expanded ? "chevron-up" : "chevron-down"} size={14} />
                            </button>
                          </div>
                          <div className="px-4 py-3">
                            <div className="flex items-start gap-2 font-mono text-[12px] text-slate-700">
                              <span className="text-emerald-600 select-none">$</span>
                              <span className="break-words">{j.cmd}</span>
                            </div>
                            {(expanded || isActive) &&
                              (j.output !== null ? (
                                <pre className="mt-2.5 max-h-72 overflow-auto console-scroll rounded-md bg-slate-900 p-3 text-[12px] leading-relaxed text-slate-200 whitespace-pre-wrap break-words">
                                  {j.output}
                                </pre>
                              ) : (
                                <div className="mt-2.5 rounded-md bg-slate-900 p-3 font-mono text-[12px] text-slate-400">
                                  等待助手输出 <span className="cursor-blink">▊</span>
                                </div>
                              ))}
                            {!expanded && !isActive && j.output !== null && (
                              <button
                                type="button"
                                onClick={() => toggleJob(j.id)}
                                className="mt-2 text-[11px] text-blue-600 hover:underline"
                              >
                                展开输出
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab === "logs" && (
              <div className="h-full p-4 flex flex-col">
                <div className="flex-1 min-h-0 flex flex-col rounded-lg bg-slate-900 overflow-hidden shadow-product">
                  <div className="shrink-0 flex items-center gap-3 px-3.5 py-2 bg-slate-800/70 border-b border-slate-700/60">
                    <Icon name="activity" size={14} className="text-slate-400" />
                    <span className="font-mono text-[11px] text-slate-400">LogHub · ops-test · 操作审计流</span>
                    <span className="flex-1" />
                    <span className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      同步中
                    </span>
                  </div>
                  <div
                    ref={logRef}
                    className="flex-1 overflow-y-auto console-scroll px-4 py-3 font-mono text-[12.5px] leading-relaxed"
                  >
                    <div className="text-slate-500 whitespace-pre-wrap">
                      {`CloudOps LogHub v2.4.1 — 运维操作审计流\n主机 ops-test · 权限 readonly · 2026-08-31\n所有指令由 AI 运维助手代为执行,操作实时落盘审计`}
                    </div>
                    {messages.length === 0 && <div className="mt-3 text-slate-600">{"// 暂无操作日志"}</div>}
                    <div className="mt-3 space-y-1.5">
                      {messages.map((m, i) =>
                        m.role === "user" ? (
                          <div key={i} className="break-words">
                            <span className="text-emerald-400">
                              [#{String(i + 1).padStart(2, "0")}] ops@ops-test:~$
                            </span>{" "}
                            <span className="text-slate-200">{m.content}</span>
                          </div>
                        ) : (
                          <div
                            key={i}
                            className="text-slate-300/90 whitespace-pre-wrap break-words border-l-2 border-slate-700 pl-3"
                          >
                            {m.content}
                          </div>
                        ),
                      )}
                      {busy && (
                        <div>
                          <span className="text-slate-500">assistant 执行中</span>{" "}
                          <span className="cursor-blink text-slate-300">▊</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <AiRail
          title="运维助手"
          subtitle="巡检、读文件、跑脚本"
          icon="bot"
          accent="sky"
          messages={messages}
          onSend={onSend}
          busy={busy}
          placeholder="给助手一条运维指令…"
          suggestions={["工作目录里有哪些文件", "读一下今日日报"]}
          empty="我可以读工作目录、跑巡检脚本、拉取服务状态。"
        />
      </div>
    </div>
  );
}

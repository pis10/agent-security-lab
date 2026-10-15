"use client";
import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "./api";
import { AdminFrame } from "./components/AdminFrame";
import { Tag } from "./components/Badge";
import { Icon } from "./components/Icon";
import type { AdminUser, Meta, ProgressMap } from "./types";

type Action = Parameters<typeof api.adminAction>[1];

interface Issued {
  username: string;
  display_name: string;
  password: string;
}

/**每行一个账号：用户名 + 可选显示名，空白或逗号分隔。 */
function parseLines(text: string): Array<{ line: string; username: string; displayName: string }> {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => {
      const [username, ...rest] = line.split(/[\s,，\t]+/);
      return { line, username, displayName: rest.join(" ") };
    });
}

/**内网多为 http 访问，navigator.clipboard 不可用时退回 execCommand。 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 退回下面的做法 */
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}

function formatTime(ts: number | null): string {
  if (!ts) return "从未登录";
  return new Date(ts * 1000).toLocaleString("zh-CN", { hour12: false });
}

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.disabled) return <Tag>已停用</Tag>;
  if (user.must_change_password) return <Tag tone="warn">待改初始密码</Tag>;
  return <Tag tone="ok">正常</Tag>;
}

function IssuedPanel({ issued, onClose }: { issued: { title: string; rows: Issued[] }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyAll = () => {
    const loginUrl = `${window.location.origin}/login`;
    const lines = issued.rows.map((r) => `${r.username}\t${r.display_name}\t${r.password}`);
    void copyText([`靶场地址：${loginUrl}`, "用户名\t显示名\t初始密码", ...lines].join("\n")).then(setCopied);
  };
  return (
    <div className="card border-warn/30 bg-warn-soft p-4 mb-5" role="status">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-ink">{issued.title}</div>
          <div className="text-[12px] text-warn mt-0.5 leading-relaxed">
            初始密码只显示这一次，请转交本人；本人首次登录后须修改。
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost btn-sm px-1.5" aria-label="关闭">
          <Icon name="x" size={14} />
        </button>
      </div>
      <table className="mt-3 w-full text-[12px]">
        <tbody>
          {issued.rows.map((r) => (
            <tr key={r.username} className="border-t border-warn/20">
              <td className="py-1.5 pr-3 font-mono text-ink">{r.username}</td>
              <td className="py-1.5 pr-3 text-ink-2">{r.display_name}</td>
              <td className="py-1.5 font-mono text-ink select-all">{r.password}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={copyAll} className="btn btn-sm mt-3">
        <Icon name={copied ? "check" : "file-text"} size={12} />
        {copied ? "已复制" : "复制登录地址与账号密码"}
      </button>
    </div>
  );
}

export function AdminUsers({
  meta,
  progress,
  scenarioCount,
  selfId,
}: {
  meta: Meta;
  progress: ProgressMap;
  scenarioCount: number;
  selfId: number;
}) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batch, setBatch] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState<string[]>([]);
  const [issued, setIssued] = useState<{ title: string; rows: Issued[] } | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api
      .adminUsers()
      .then((body) => {
        setUsers(body.users);
        setLoadError(null);
      })
      .catch((e) => setLoadError(errorText(e)));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const create = async () => {
    const entries = parseLines(batch);
    if (entries.length === 0 || creating) return;
    setCreating(true);
    setCreateErrors([]);
    const rows: Issued[] = [];
    const errors: string[] = [];
    const failed: string[] = [];
    for (const entry of entries) {
      try {
        const r = await api.adminCreateUser(entry.username, entry.displayName, asAdmin);
        rows.push({ username: r.user.username, display_name: r.user.display_name, password: r.initial_password });
      } catch (e) {
        errors.push(`${entry.username}：${errorText(e)}`);
        failed.push(entry.line);
      }
    }
    if (rows.length > 0) setIssued({ title: `已创建 ${rows.length} 个账号`, rows });
    // 失败的行留在输入框里，改完可以直接再提交
    setBatch(failed.join("\n"));
    setCreateErrors(errors);
    setCreating(false);
    reload();
  };

  const act = (user: AdminUser, action: Action, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setPending(user.id);
    setRowError(null);
    api
      .adminAction(user.id, action)
      .then((r) => {
        if (r.initial_password) {
          setIssued({
            title: `已重置 ${user.username} 的密码`,
            rows: [{ username: user.username, display_name: user.display_name, password: r.initial_password }],
          });
        }
      })
      .catch((e) => setRowError(`${user.username}：${errorText(e)}`))
      .finally(() => {
        setPending(null);
        reload();
      });
  };

  const adminCount = users?.filter((u) => u.is_admin && !u.disabled).length ?? 0;
  const lineCount = parseLines(batch).length;
  const linkBtn = "text-ink-2 hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed";
  const dangerBtn = "text-ink-2 hover:text-danger disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <AdminFrame
      active="users"
      meta={meta}
      progress={progress}
      scenarioCount={scenarioCount}
      title="账号管理"
      description="为学员创建账号，并把初始密码转交本人。每个账号的产品数据与通关进度相互独立。"
    >
      {issued && <IssuedPanel issued={issued} onClose={() => setIssued(null)} />}

      <section className="card p-5 mb-5">
        <h2 className="text-[14px] font-semibold text-ink">创建账号</h2>
        <p className="text-[12px] text-muted mt-1 leading-relaxed">
          每行一个：用户名 显示名（显示名可省略）。用户名限 2–32 位小写字母、数字或 . _ -；初始密码随机生成。
        </p>
        <textarea
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          rows={4}
          placeholder={"zhangsan 张三\nlisi 李四"}
          aria-label="待创建的账号，每行一个"
          className="field mt-3 font-mono"
        />
        {createErrors.length > 0 && (
          <ul role="alert" className="mt-2 space-y-0.5 text-[12px] text-danger">
            {createErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2">
            <input type="checkbox" checked={asAdmin} onChange={(e) => setAsAdmin(e.target.checked)} />
            设为管理员
          </label>
          <button type="button" onClick={create} disabled={creating || lineCount === 0} className="btn-primary">
            {creating ? "创建中…" : lineCount > 1 ? `创建 ${lineCount} 个账号` : "创建账号"}
          </button>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-line flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-ink">全部账号</h2>
          {users && (
            <div className="text-[12px] text-muted">
              共 {users.length} 个 · 管理员 {adminCount} 个
            </div>
          )}
        </div>
        {rowError && (
          <div role="alert" className="px-5 py-2 text-[12px] text-danger border-b border-line">
            {rowError}
          </div>
        )}
        {loadError ? (
          <div className="px-5 py-8 text-center text-[13px] text-danger">{loadError}</div>
        ) : users === null ? (
          <div className="px-5 py-8 text-center text-[13px] text-muted">加载中…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[12px] text-muted bg-sunken/60">
                  <th className="px-5 py-2 font-medium">账号</th>
                  <th className="px-3 py-2 font-medium">状态</th>
                  <th className="px-3 py-2 font-medium">通关</th>
                  <th className="px-3 py-2 font-medium">最近登录</th>
                  <th className="px-5 py-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const self = u.id === selfId;
                  const busy = pending === u.id;
                  return (
                    <tr key={u.id} className={`border-t border-line ${u.disabled ? "text-muted" : ""}`}>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className={u.disabled ? "" : "text-ink font-medium"}>{u.display_name}</span>
                          {u.is_admin && <Tag tone="brand">管理员</Tag>}
                          {self && <span className="text-[11px] text-muted">（我）</span>}
                        </div>
                        <div className="font-mono text-[12px] text-muted">{u.username}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge user={u} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`tabular-nums ${u.captured > 0 ? "text-ok" : "text-muted"}`}>
                          {u.captured}/{scenarioCount}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-muted whitespace-nowrap">
                        {formatTime(u.last_login_at)}
                      </td>
                      <td className="px-5 py-2.5">
                        <div className="flex items-center justify-end gap-3 text-[12px] whitespace-nowrap">
                          <button
                            type="button"
                            disabled={busy}
                            className={linkBtn}
                            onClick={() =>
                              act(
                                u,
                                "reset_password",
                                `重置 ${u.username} 的密码？其当前登录会失效，并生成新的初始密码。`,
                              )
                            }
                          >
                            重置密码
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            className={linkBtn}
                            onClick={() =>
                              act(u, "reset_progress", `清除 ${u.username} 的全部产品数据与通关进度？此操作不可撤销。`)
                            }
                          >
                            重置进度
                          </button>
                          {!self && (
                            <button
                              type="button"
                              disabled={busy}
                              className={linkBtn}
                              onClick={() =>
                                u.is_admin
                                  ? act(u, "revoke_admin", `取消 ${u.username} 的管理员身份？`)
                                  : act(u, "grant_admin", `将 ${u.username} 设为管理员？`)
                              }
                            >
                              {u.is_admin ? "取消管理员" : "设为管理员"}
                            </button>
                          )}
                          {!self && (
                            <button
                              type="button"
                              disabled={busy}
                              className={u.disabled ? linkBtn : dangerBtn}
                              onClick={() =>
                                u.disabled
                                  ? act(u, "enable")
                                  : act(u, "disable", `停用 ${u.username}？其当前登录会立即失效。`)
                              }
                            >
                              {u.disabled ? "启用" : "停用"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminFrame>
  );
}

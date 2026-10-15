"use client";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "./api";
import { Icon } from "./components/Icon";
import { MIN_PASSWORD_LENGTH, type PublicUser } from "./types";

/**登录与改密：居中的紧凑表单，面向内部技术人员，不做宣传页。 */
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[360px]">
        <div className="flex items-center gap-2 mb-5">
          <span className="h-7 w-7 rounded-md bg-brand text-white flex items-center justify-center">
            <Icon name="target" size={15} strokeWidth={2} />
          </span>
          <span className="font-mono font-bold text-[15px] tracking-tight">ASL</span>
          <span className="text-[13px] text-muted">Agent 安全靶场</span>
        </div>
        <div className="card p-6">{children}</div>
        <p className="mt-4 text-[12px] text-muted">账号由管理员创建，忘记密码请联系管理员重置。</p>
      </div>
    </main>
  );
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  autoComplete,
  focus = false,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  /**页面打开时聚焦这一项。 */
  focus?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return (
    <label className="block">
      <span className="block text-[13px] font-medium text-ink-2 mb-1.5">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        ref={ref}
        required
        className="field h-9"
      />
    </label>
  );
}

function FormError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger leading-relaxed"
    >
      <Icon name="alert-triangle" size={14} className="mt-0.5" />
      {text}
    </div>
  );
}

export function LoginForm({ next, firstRunAdmin }: { next: string; firstRunAdmin: string | null }) {
  const [username, setUsername] = useState(firstRunAdmin ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    api
      .login(username, password)
      .then(({ user }) => {
        window.location.href = user.must_change_password ? "/account/password" : next;
      })
      .catch((err) => {
        setError(errorText(err));
        setBusy(false);
      });
  };

  return (
    <AuthLayout>
      <h1 className="text-[17px] font-semibold text-ink">登录</h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="用户名" value={username} onChange={setUsername} autoComplete="username" focus={!firstRunAdmin} />
        <Field
          label="密码"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          focus={!!firstRunAdmin}
        />
        <FormError text={error} />
        <button type="submit" disabled={busy || !username.trim() || !password} className="btn-primary w-full">
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
      {firstRunAdmin && (
        <p className="mt-4 text-[12px] text-muted leading-relaxed">
          首次部署：<span className="font-mono">{firstRunAdmin}</span> 的初始密码为
          ASL_ADMIN_PASSWORD，未设置时见服务启动日志。
        </p>
      )}
    </AuthLayout>
  );
}

function Rule({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-2 text-[13px] ${ok ? "text-ok" : "text-muted"}`}>
      {ok ? (
        <Icon name="check" size={14} strokeWidth={2.2} />
      ) : (
        <span className="h-3.5 w-3.5 flex items-center justify-center" aria-hidden>
          <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        </span>
      )}
      {children}
    </li>
  );
}

export function PasswordForm({ user }: { user: PublicUser }) {
  const mustChange = user.must_change_password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const longEnough = next.length >= MIN_PASSWORD_LENGTH;
  const matches = next !== "" && next === confirm;
  const differs = next !== "" && next !== current;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!longEnough) return setError(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`);
    if (!matches) return setError("两次输入的新密码不一致");
    if (!differs) return setError("新密码不能与当前密码相同");
    setBusy(true);
    setError(null);
    api
      .changePassword(current, next)
      .then(() => {
        window.location.href = "/";
      })
      .catch((err) => {
        setError(errorText(err));
        setBusy(false);
      });
  };

  const logout = () => {
    api.logout().finally(() => {
      window.location.href = "/login";
    });
  };

  return (
    <AuthLayout>
      <h1 className="text-[17px] font-semibold text-ink">{mustChange ? "设置新密码" : "修改密码"}</h1>
      <p className="mt-1 text-[13px] text-ink-2 leading-relaxed">
        {mustChange ? (
          <>
            <span className="font-mono">{user.username}</span> 首次登录，需要把初始密码换成自己的密码。
          </>
        ) : (
          <>
            当前账号 <span className="font-mono">{user.username}</span>，修改后其他设备上的登录会失效。
          </>
        )}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field
          label={mustChange ? "初始密码" : "当前密码"}
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          focus
        />
        <Field label="新密码" type="password" value={next} onChange={setNext} autoComplete="new-password" />
        <Field label="确认新密码" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <ul className="space-y-1.5" aria-label="密码要求">
          <Rule ok={longEnough}>至少 {MIN_PASSWORD_LENGTH} 位</Rule>
          <Rule ok={matches}>两次输入一致</Rule>
          <Rule ok={differs}>与{mustChange ? "初始" : "当前"}密码不同</Rule>
        </ul>
        <FormError text={error} />
        <button type="submit" disabled={busy || !current || !next || !confirm} className="btn-primary w-full">
          {busy ? "保存中…" : mustChange ? "保存并进入" : "保存新密码"}
        </button>
      </form>
      <div className="mt-5 flex items-center justify-between text-[13px]">
        {mustChange ? (
          <span />
        ) : (
          <Link href="/" className="text-ink-2 hover:text-ink">
            返回首页
          </Link>
        )}
        <button type="button" onClick={logout} className="text-ink-2 hover:text-ink">
          退出登录
        </button>
      </div>
    </AuthLayout>
  );
}

"use client";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "./api";
import { Icon } from "./components/Icon";
import { MIN_PASSWORD_LENGTH, type PublicUser } from "./types";

const INPUT =
  "mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200";
const SUBMIT =
  "w-full rounded-md bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] py-2";

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 font-mono font-bold text-lg text-accent mb-6">
          <Icon name="target" size={18} />
          ASL
        </div>
        <div className="p-card p-6">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <div className="text-[13px] text-slate-500 mt-1 leading-relaxed">{subtitle}</div>}
          <div className="mt-5">{children}</div>
        </div>
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
    <label className="block text-[12px] text-slate-500">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        ref={ref}
        required
        className={INPUT}
      />
    </label>
  );
}

function FormError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-1.5 text-[12px] text-red-600 leading-relaxed">
      <Icon name="alert-triangle" size={12} className="mt-0.5 shrink-0" />
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
    <AuthCard title="登录靶场" subtitle="账号由管理员创建。忘记密码请联系管理员重置。">
      <form onSubmit={submit} className="space-y-3">
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
        <button type="submit" disabled={busy || !username.trim() || !password} className={SUBMIT}>
          {busy ? "登录中…" : "登录"}
        </button>
      </form>
      {firstRunAdmin && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 leading-relaxed">
          首次启动：管理员 <span className="font-mono">{firstRunAdmin}</span> 的初始密码在服务启动日志里（如部署时设置了
          ASL_ADMIN_PASSWORD 则为该值）。登录后须先修改密码。
        </div>
      )}
    </AuthCard>
  );
}

export function PasswordForm({ user }: { user: PublicUser }) {
  const mustChange = user.must_change_password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN_PASSWORD_LENGTH) return setError(`新密码至少 ${MIN_PASSWORD_LENGTH} 位`);
    if (next !== confirm) return setError("两次输入的新密码不一致");
    if (next === current) return setError("新密码不能与当前密码相同");
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
    <AuthCard
      title={mustChange ? "设置新密码" : "修改密码"}
      subtitle={
        mustChange ? (
          <>
            <span className="font-mono">{user.username}</span>，首次登录请把管理员给你的初始密码换成自己的密码。
          </>
        ) : (
          <>
            当前账号 <span className="font-mono">{user.username}</span>。修改后其他设备上的登录会失效。
          </>
        )
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Field
          label={mustChange ? "初始密码" : "当前密码"}
          type="password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          focus
        />
        <Field
          label={`新密码（至少 ${MIN_PASSWORD_LENGTH} 位）`}
          type="password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
        <Field label="确认新密码" type="password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        <FormError text={error} />
        <button type="submit" disabled={busy || !current || !next || !confirm} className={SUBMIT}>
          {busy ? "保存中…" : "保存新密码"}
        </button>
      </form>
      <div className="mt-4 flex items-center justify-between text-[12px] text-slate-500">
        {mustChange ? (
          <span />
        ) : (
          <Link href="/" className="hover:text-slate-800">
            返回靶场
          </Link>
        )}
        <button type="button" onClick={logout} className="hover:text-slate-800">
          退出登录
        </button>
      </div>
    </AuthCard>
  );
}

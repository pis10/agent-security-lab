"use client";
import { useEffect, useRef, useState } from "react";
import { errorText } from "../api";
import { Icon } from "./Icon";

/**外部来信：以任意发件人向本收件箱投信，模拟攻击者从自己的服务器发来的邮件。 */
export function ExternalMailDialog({
  onDeliver,
  onClose,
}: {
  onDeliver: (mail: { from: string; subject: string; body: string }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    onDeliver({ from: from.trim(), subject: subject.trim(), body })
      .then(onClose)
      .catch((err) => setError(errorText(err)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="ext-mail-title"
        onSubmit={submit}
        className="card shadow-pop w-full max-w-lg p-5 space-y-4 rise-in"
      >
        <div className="flex items-start gap-3">
          <span className="h-9 w-9 rounded-lg bg-brand-soft text-brand flex items-center justify-center shrink-0">
            <Icon name="mail" size={17} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="ext-mail-title" className="text-[15px] font-semibold text-ink">
              外部来信
            </h2>
            <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
              攻击者视角：以任意发件人身份向这个收件箱投递一封邮件。现实中它从攻击者自己的服务器发出，落进邮箱后与普通来信没有区别。
            </p>
          </div>
          <button type="button" className="btn-ghost btn-sm px-1.5" onClick={onClose} aria-label="关闭">
            <Icon name="x" size={14} />
          </button>
        </div>
        <label className="block">
          <span className="text-[12px] text-ink-2">发件人</span>
          <input
            ref={first}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="field mt-1"
            placeholder="name@example.com"
            autoComplete="off"
          />
        </label>
        <label className="block">
          <span className="text-[12px] text-ink-2">主题</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="field mt-1" />
        </label>
        <label className="block">
          <span className="text-[12px] text-ink-2">正文</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="field mt-1 font-mono text-[12.5px] leading-relaxed"
          />
        </label>
        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !from.trim() || !subject.trim()}>
            <Icon name="send" size={13} />
            {busy ? "投递中…" : "投递到收件箱"}
          </button>
        </div>
      </form>
    </div>
  );
}

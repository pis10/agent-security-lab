"use client";
import type { ReactNode } from "react";
import type { ChatMessage } from "../types";
import { Icon } from "./Icon";
import type { ChatAccent } from "./SimChat";
import { SimChat } from "./SimChat";

const AVATAR_TONES = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-cyan-100 text-cyan-700",
];

function toneOf(seed: string, tones: string[]) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return tones[h % tones.length];
}

export function Avatar({ name, className = "h-8 w-8 text-xs" }: { name: string; className?: string }) {
  const display = name.split("@")[0] || name;
  return (
    <div
      className={`${className} shrink-0 rounded-full flex items-center justify-center font-semibold select-none ${toneOf(
        name,
        AVATAR_TONES,
      )}`}
    >
      {display.slice(0, 1).toUpperCase() || "?"}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "搜索…",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-2 bg-slate-100 border border-transparent rounded-md px-3 py-1.5 text-[13px] text-slate-600 focus-within:bg-white focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition ${className}`}
    >
      <Icon name="search" size={14} className="text-slate-400" />
      <input
        className="flex-1 bg-transparent outline-hidden placeholder:text-slate-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="text-slate-400 hover:text-slate-600">
          <Icon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

type PButtonVariant = "primary" | "outline" | "ghost" | "danger";
const PBUTTON_CLS: Record<PButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 border border-blue-600",
  outline: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400",
  ghost: "bg-transparent text-slate-600 border border-transparent hover:bg-slate-100",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50 hover:border-red-300",
};

export function PButton({
  variant = "primary",
  icon,
  children,
  className = "",
  ...rest
}: {
  variant?: PButtonVariant;
  icon?: string;
  children?: ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${PBUTTON_CLS[variant]} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

type PBadgeTone = "slate" | "blue" | "green" | "amber" | "red" | "violet";
const PBADGE_CLS: Record<PBadgeTone, string> = {
  slate: "bg-slate-100 text-slate-600",
  blue: "bg-blue-50 text-blue-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-600",
  violet: "bg-violet-50 text-violet-700",
};

export function PBadge({
  tone = "slate",
  icon,
  children,
  className = "",
}: {
  tone?: PBadgeTone;
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${PBADGE_CLS[tone]} ${className}`}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

export function Stat({ icon, label, value, hint }: { icon: string; label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="p-card px-4 py-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
        <Icon name={icon} size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold leading-tight text-slate-900">{value}</div>
        <div className="text-[11px] text-slate-400 truncate" title={hint}>
          {label}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 p-8 text-center">
      <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center">
        <Icon name={icon} size={18} />
      </div>
      <div className="text-[13px] font-medium text-slate-500">{title}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

const RAIL_MARK: Record<ChatAccent, string> = {
  blue: "from-blue-500 to-indigo-600",
  orange: "from-orange-500 to-amber-500",
  sky: "from-sky-500 to-cyan-600",
  violet: "from-indigo-500 to-violet-600",
  emerald: "from-emerald-500 to-teal-600",
};

const CHIP: Record<ChatAccent, string> = {
  blue: "bg-blue-50 text-blue-700 hover:bg-blue-100",
  orange: "bg-orange-50 text-orange-800 hover:bg-orange-100",
  sky: "bg-sky-50 text-sky-800 hover:bg-sky-100",
  violet: "bg-violet-50 text-violet-800 hover:bg-violet-100",
  emerald: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
};

export function AiRail({
  title,
  subtitle,
  icon = "sparkles",
  accent = "blue",
  messages,
  onSend,
  onResetChat,
  busy,
  placeholder = "发给助手…",
  suggestions = [],
  empty,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  accent?: ChatAccent;
  messages: ChatMessage[];
  onSend: (m: string) => void;
  onResetChat?: () => void;
  busy: boolean;
  placeholder?: string;
  suggestions?: string[];
  empty?: string;
}) {
  const showChips = messages.length === 0 && suggestions.length > 0 && !busy;
  return (
    <aside className="w-[300px] shrink-0 bg-white border-l border-slate-200 flex flex-col min-h-0">
      <div className="shrink-0 px-3 py-2.5 border-b border-slate-200 flex items-center gap-2">
        <span
          className={`h-7 w-7 rounded-lg bg-linear-to-br ${RAIL_MARK[accent]} text-white flex items-center justify-center shadow-product`}
        >
          <Icon name={icon} size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-slate-800 truncate">{title}</div>
          {subtitle && <div className="text-[11px] text-slate-400 truncate">{subtitle}</div>}
        </div>
        {onResetChat && messages.length > 0 && !busy && (
          <button
            type="button"
            onClick={onResetChat}
            className="h-7 w-7 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
            title="清空对话"
            aria-label="清空对话"
          >
            <Icon name="refresh" size={14} />
          </button>
        )}
        {busy && (
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            正在回复
          </span>
        )}
      </div>
      {showChips && (
        <div className="shrink-0 px-3 pt-2.5 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSend(s)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${CHIP[accent]}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <SimChat
          messages={messages}
          onSend={onSend}
          busy={busy}
          placeholder={placeholder}
          compact
          tone="light"
          accent={accent}
          empty={empty}
        />
      </div>
    </aside>
  );
}

export function AiWidget({
  title,
  greeting,
  accent = "orange",
  messages,
  onSend,
  onResetChat,
  busy,
  placeholder = "请输入问题…",
  suggestions = [],
  open,
  onOpenChange,
  className = "right-4",
}: {
  title: string;
  greeting: string;
  accent?: ChatAccent;
  messages: ChatMessage[];
  onSend: (m: string) => void;
  onResetChat?: () => void;
  busy: boolean;
  placeholder?: string;
  suggestions?: string[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  className?: string;
}) {
  const unread = !open && messages.length > 0;
  return (
    <div className={`absolute bottom-4 z-30 flex flex-col items-end gap-2 ${className}`}>
      {open ? (
        <div className="w-[340px] h-[420px] bg-white rounded-2xl shadow-pop border border-slate-200 flex flex-col overflow-hidden rise-in">
          <div className={`shrink-0 px-4 py-3 bg-linear-to-r ${RAIL_MARK[accent]} text-white flex items-center gap-2`}>
            <span className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Icon name="bot" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate">{title}</div>
              <div className="text-[11px] text-white/80">在线</div>
            </div>
            {onResetChat && messages.length > 0 && !busy && (
              <button
                type="button"
                onClick={onResetChat}
                className="h-7 w-7 rounded-full hover:bg-white/15 flex items-center justify-center"
                title="清空对话"
                aria-label="清空对话"
              >
                <Icon name="refresh" size={14} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 rounded-full hover:bg-white/15 flex items-center justify-center"
              title="收起"
            >
              <Icon name="chevron-down" size={16} />
            </button>
          </div>
          {messages.length === 0 && suggestions.length > 0 && (
            <div className="shrink-0 px-3 pt-3 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSend(s)}
                  className={`rounded-full px-2.5 py-1 text-[11px] transition-colors ${CHIP[accent]}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 min-h-0">
            <SimChat
              messages={messages}
              onSend={onSend}
              busy={busy}
              placeholder={placeholder}
              compact
              tone="light"
              accent={accent}
              empty={greeting}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className={`relative h-14 w-14 rounded-full bg-linear-to-br ${RAIL_MARK[accent]} text-white shadow-pop flex items-center justify-center hover:scale-105 transition-transform`}
          title={title}
        >
          <Icon name="message-square" size={22} />
          {unread && <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-red-500 border-2 border-white" />}
        </button>
      )}
    </div>
  );
}

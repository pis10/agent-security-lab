"use client";
import { Icon } from "./Icon";

const TIER_CLS: Record<string, string> = {
  L1: "text-tier-1 border-tier-1/30 bg-tier-1/5",
  L2: "text-tier-2 border-tier-2/30 bg-tier-2/5",
  L3: "text-tier-3 border-tier-3/30 bg-tier-3/5",
  L4: "text-tier-4 border-tier-4/30 bg-tier-4/5",
  L5: "text-tier-5 border-tier-5/30 bg-tier-5/5",
};

export function TierBadge({ tier, size = "md" }: { tier: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-5 px-1.5 text-[11px]" : "h-6 px-2 text-[12px]";
  return (
    <span
      className={`inline-flex items-center rounded-md border font-mono font-semibold ${box} ${TIER_CLS[tier] ?? "text-ink-2 border-line"}`}
    >
      {tier}
    </span>
  );
}

type Tone = "neutral" | "ok" | "warn" | "info" | "danger" | "brand";

const TONE_CLS: Record<Tone, string> = {
  neutral: "border-line bg-surface text-ink-2",
  ok: "border-ok/25 bg-ok-soft text-ok",
  warn: "border-warn/25 bg-warn-soft text-warn",
  info: "border-info/25 bg-info-soft text-info",
  danger: "border-danger/25 bg-danger-soft text-danger",
  brand: "border-brand/25 bg-brand-soft text-brand",
};

export function Tag({
  children,
  tone = "neutral",
  icon,
  title,
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: string;
  title?: string;
}) {
  return (
    <span className={`tag ${TONE_CLS[tone]}`} title={title}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/**当前模型；未配置时显示提醒。 */
export function ModelBadge({ model }: { model: string | null }) {
  if (!model) {
    return (
      <Tag tone="warn" icon="alert-triangle">
        未配置模型
      </Tag>
    );
  }
  return (
    <span className="tag max-w-56 font-mono text-[11px]" title={`当前模型：${model}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-ok shrink-0" aria-hidden />
      <span className="truncate">{model}</span>
    </span>
  );
}

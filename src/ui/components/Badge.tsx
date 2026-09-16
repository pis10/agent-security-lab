"use client";
import { Icon } from "./Icon";

export function TierBadge({ tier, light = false }: { tier: string; light?: boolean }) {
  const dark: Record<string, string> = {
    L1: "text-info border-info/50",
    L2: "text-ok border-ok/50",
    L3: "text-warn border-warn/50",
    L4: "text-accent border-accent/50",
    L5: "text-violet border-violet/50",
  };
  const onLight: Record<string, string> = {
    L1: "text-sky-700 border-sky-200 bg-sky-50",
    L2: "text-emerald-700 border-emerald-200 bg-emerald-50",
    L3: "text-amber-700 border-amber-200 bg-amber-50",
    L4: "text-red-700 border-red-200 bg-red-50",
    L5: "text-violet-700 border-violet-200 bg-violet-50",
  };
  return (
    <span className={`${light ? "chip-light" : "chip"} ${light ? onLight[tier] : (dark[tier] ?? "")}`}>{tier}</span>
  );
}

export function Tag({ text, light = false }: { text: string; light?: boolean }) {
  return <span className={light ? "chip-light" : "chip"}>{text}</span>;
}

export function LlmBadge({ model }: { model: string }) {
  return (
    <span className="chip text-ok border-ok/50" title={model}>
      <Icon name="radio" size={10} />
      {model}
    </span>
  );
}

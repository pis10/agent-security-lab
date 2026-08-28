export function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = {
    L1: "text-info border-info/50",
    L2: "text-ok border-ok/50",
    L3: "text-warn border-warn/50",
    L4: "text-accent border-accent/50",
    L5: "text-violet border-violet/50",
  };
  return (
    <span className={`chip ${colors[tier] ?? ""}`}>{tier}</span>
  );
}

export function Tag({ text }: { text: string }) {
  return <span className="chip">{text}</span>;
}

export function LlmBadge({ mode, model }: { mode: string; model: string | null }) {
  return mode === "mock" ? (
    <span className="chip text-warn border-warn/50">MOCK LLM · 离线脚本回放</span>
  ) : (
    <span className="chip text-ok border-ok/50">LIVE · {model}</span>
  );
}

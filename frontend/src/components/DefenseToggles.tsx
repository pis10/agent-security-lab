import type { DefenseInfo } from "../types";

export function DefenseToggles({
  defenses,
  selected,
  onToggle,
  dirty,
  onApply,
}: {
  defenses: DefenseInfo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  dirty: boolean;
  onApply: () => void;
}) {
  if (defenses.length === 0)
    return <div className="text-dim text-xs">// 该靶标本关没有可开关的防护</div>;
  return (
    <div className="space-y-2">
      {defenses.map((d) => {
        const on = selected.has(d.id);
        return (
          <label key={d.id} className="flex items-start gap-2 cursor-pointer group" title={d.description}>
            <button
              type="button"
              onClick={() => onToggle(d.id)}
              className={`mt-0.5 w-8 h-4.5 rounded-full border transition-colors relative shrink-0 ${
                on ? "bg-ok/20 border-ok/60" : "bg-elevated border-edge"
              }`}
              style={{ height: 18 }}
            >
              <span
                className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                  on ? "left-4 bg-ok" : "left-0.5 bg-dim"
                }`}
              />
            </button>
            <span className={`text-[13px] ${on ? "text-ok" : "text-slate-300 group-hover:text-slate-100"}`}>
              {d.name}
              <span className="block text-[11px] text-dim">{d.description}</span>
            </span>
          </label>
        );
      })}
      {dirty && (
        <button className="btn-primary w-full mt-1" onClick={onApply}>
          应用防护并重启会话（复测）
        </button>
      )}
    </div>
  );
}

"use client";
import type { DefenseInfo } from "../types";
import { Icon } from "./Icon";

export function DefenseToggles({
  defenses,
  selected,
  onToggle,
  dirty = false,
  onApply,
}: {
  defenses: DefenseInfo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  dirty?: boolean;
  onApply?: () => void;
}) {
  if (defenses.length === 0)
    return (
      <div className="flex items-center gap-1.5 text-slate-400 text-xs">
        <Icon name="shield" size={12} />
        本产品暂无可开关的防护
      </div>
    );
  return (
    <div className="space-y-2">
      {defenses.map((d) => {
        const on = selected.has(d.id);
        return (
          <div key={d.id} className="flex items-start gap-2.5 group" title={d.description}>
            <button
              type="button"
              onClick={() => onToggle(d.id)}
              className={`mt-0.5 relative w-9 h-5 rounded-full border transition-colors shrink-0 ${
                on ? "bg-emerald-100 border-emerald-400" : "bg-slate-100 border-slate-300"
              }`}
            >
              <span
                className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${
                  on ? "left-[18px] bg-emerald-600" : "left-0.5 bg-slate-400"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => onToggle(d.id)}
              className={`text-left text-[13px] transition-colors ${
                on ? "text-emerald-700" : "text-slate-700 group-hover:text-slate-900"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name={on ? "shield-check" : "shield"} size={13} />
                {d.name}
              </span>
              <span className="block text-[11px] text-slate-400 mt-0.5 leading-snug">{d.description}</span>
            </button>
          </div>
        );
      })}
      {dirty && onApply && (
        <button
          type="button"
          className="w-full mt-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] py-1.5"
          onClick={onApply}
        >
          <Icon name="refresh" size={13} />
          应用防护
        </button>
      )}
    </div>
  );
}

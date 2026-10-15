"use client";
import type { DefenseInfo } from "../types";
import { Icon } from "./Icon";

/**防护开关：立即生效，不清除产品数据。 */
export function DefenseToggles({
  defenses,
  selected,
  onToggle,
  disabled = false,
}: {
  defenses: DefenseInfo[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  disabled?: boolean;
}) {
  if (defenses.length === 0)
    return (
      <div className="flex items-center gap-1.5 text-muted text-[13px]">
        <Icon name="shield" size={13} />
        本产品暂无可开关的防护
      </div>
    );
  return (
    <ul className="space-y-2">
      {defenses.map((d) => {
        const on = selected.has(d.id);
        return (
          <li key={d.id}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              disabled={disabled}
              onClick={() => onToggle(d.id)}
              className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                on ? "border-ok/30 bg-ok-soft/60" : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 relative w-9 h-5 rounded-full shrink-0 transition-colors ${on ? "bg-ok" : "bg-line-strong"}`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-raise transition-all ${
                    on ? "left-[18px]" : "left-0.5"
                  }`}
                />
              </span>
              <span className="min-w-0">
                <span className={`flex items-center gap-1.5 text-[13px] font-medium ${on ? "text-ok" : "text-ink"}`}>
                  <Icon name={on ? "shield-check" : "shield"} size={13} />
                  {d.name}
                  <span className="text-[11px] font-normal text-muted">{on ? "已开启" : "未开启"}</span>
                </span>
                <span className="block text-[12px] text-ink-2 mt-1 leading-relaxed">{d.description}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

"use client";
import type { Observation } from "../types";
import { Icon } from "./Icon";

/**通关时刻：顶部弹出，可直接打开观测看证据。 */
export function CaptureToast({
  items,
  onObserve,
  onClose,
}: {
  items: Observation[];
  onObserve?: () => void;
  onClose: () => void;
}) {
  if (items.length === 0) return null;
  const first = items[0];
  const extra = items.length - 1;
  return (
    <div role="status" className="fixed top-16 left-1/2 -translate-x-1/2 z-50 w-[min(30rem,calc(100%-2rem))]">
      <div className="card border-ok/30 shadow-pop px-4 py-3.5 rise-in flex items-start gap-3">
        <span className="h-10 w-10 rounded-full bg-ok text-white flex items-center justify-center shrink-0">
          <Icon name="flag" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ok">通关！</div>
          <div className="text-[13px] text-ink-2 mt-0.5">
            {first.title}
            {extra > 0 ? ` 及另外 ${extra} 关` : ""}
          </div>
          <p className="text-[12px] text-muted mt-1 leading-relaxed">
            接下来可以打开对应防护，清空对话后用同样的方法再试一次，确认防护真的挡住了攻击。
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {onObserve && (
              <button type="button" className="btn-primary btn-sm" onClick={onObserve}>
                <Icon name="activity" size={13} />
                查看证据与防护
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={onClose}>
              继续
            </button>
          </div>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost btn-sm px-1.5" aria-label="关闭">
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

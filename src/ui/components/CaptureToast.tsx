"use client";
import Link from "next/link";
import type { Observation } from "../types";
import { Icon } from "./Icon";

export function CaptureToast({
  items,
  targetId,
  onClose,
}: {
  items: Observation[];
  targetId?: string;
  onClose: () => void;
}) {
  if (items.length === 0) return null;
  const first = items[0];
  const extra = items.length - 1;
  return (
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[min(28rem,calc(100%-2rem))]">
      <div className="rounded-lg border border-emerald-200 bg-white px-4 py-3 shadow-product rise-in flex items-start gap-3">
        <div className="h-9 w-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
          <Icon name="flag" size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-emerald-800">观测到危害</div>
          <div className="text-[12px] text-slate-500 mt-0.5 truncate">
            {first.title}
            {extra > 0 ? ` 及另外 ${extra} 条` : ""}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Link
              href={`/learn/${first.scenario_id}`}
              className="inline-flex items-center rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] px-2.5 py-1"
            >
              查看课程解析
            </Link>
            {targetId && (
              <Link
                href={`/observe/${targetId}`}
                className="inline-flex items-center rounded-md border border-slate-200 text-[12px] px-2.5 py-1 text-slate-600 hover:border-slate-300"
              >
                查看记录
              </Link>
            )}
            <button
              type="button"
              className="inline-flex items-center rounded-md border border-slate-200 text-[12px] px-2.5 py-1 text-slate-600 hover:border-slate-300"
              onClick={onClose}
            >
              继续
            </button>
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" title="关闭">
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}

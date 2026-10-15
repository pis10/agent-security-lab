"use client";
import { useEffect, useState } from "react";
import { RETEST_LABELS, type TeachingRow } from "../core/teaching.ts";
import { api, errorText } from "./api";
import { AdminFrame } from "./components/AdminFrame";
import { TierBadge } from "./components/Badge";
import { Icon } from "./components/Icon";
import type { Meta, ProgressMap } from "./types";

function time(ts: number | null): string {
  return ts === null ? "" : new Date(ts * 1000).toLocaleString("zh-CN", { hour12: false });
}

const OUTCOME_CLS: Record<NonNullable<TeachingRow["outcome"]>, string> = {
  blocked: "text-ok",
  exercised: "text-warn",
  error: "text-danger",
};

function Cell({ row }: { row: TeachingRow }) {
  return (
    <td className="px-3 py-3 align-top">
      <div
        className={`flex items-center gap-1.5 text-[13px] ${row.captured_at ? "text-ok font-medium" : "text-muted"}`}
      >
        <span
          aria-hidden
          className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 ${
            row.captured_at ? "bg-ok text-white" : "border border-line-strong"
          }`}
        >
          {row.captured_at && <Icon name="check" size={10} strokeWidth={2.8} />}
        </span>
        {row.captured_at ? "已通关" : "未通关"}
      </div>
      {row.captured_at && <div className="text-[11px] text-muted mt-0.5 pl-5.5">{time(row.captured_at)}</div>}
      <div className={`text-[12px] mt-1.5 pl-5.5 ${row.outcome ? OUTCOME_CLS[row.outcome] : "text-muted"}`}>
        {row.outcome ? RETEST_LABELS[row.outcome] : "未复测"}
      </div>
      {row.tested_at && <div className="text-[11px] text-muted pl-5.5">{time(row.tested_at)}</div>}
    </td>
  );
}

export function TeachingProgress({
  initialRows,
  answersVisible,
  meta,
  progress,
  scenarioCount,
}: {
  initialRows: TeachingRow[];
  answersVisible: boolean;
  meta: Meta;
  progress: ProgressMap;
  scenarioCount: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const [visible, setVisible] = useState(answersVisible);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const refresh = () => {
      if (document.hidden) return;
      api
        .teachingProgress()
        .then((r) => {
          setRows(r.rows);
          setError("");
        })
        .catch((e) => setError(errorText(e)));
    };
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  const toggleAnswers = async () => {
    const next = !visible;
    setSaving(true);
    try {
      await api.setAnswersVisible(next);
      setVisible(next);
      setError("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const users = [...new Map(rows.map((r) => [r.user_id, r])).values()];
  const columns = rows.slice(0, scenarioCount);
  const capturedCount = (scenarioId: string) =>
    rows.filter((r) => r.scenario_id === scenarioId && r.captured_at).length;

  return (
    <AdminFrame
      active="progress"
      meta={meta}
      progress={progress}
      scenarioCount={scenarioCount}
      title="教学进度"
      description="每人五关的首次通关与最近一次复测，每 5 秒刷新。CSV 使用 UTC 时间，页面显示本地时间。"
      actions={
        <a href="/api/admin/progress?format=csv" className="btn">
          <Icon name="download" size={14} />
          导出 CSV
        </a>
      }
    >
      <section className="card p-4 mb-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          role="switch"
          aria-checked={visible}
          disabled={saving}
          onClick={toggleAnswers}
          className={`relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 ${visible ? "bg-ok" : "bg-line-strong"}`}
        >
          <span className="sr-only">允许学员查看参考答案</span>
          <span
            aria-hidden
            className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-raise transition-all ${visible ? "left-5" : "left-1"}`}
          />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium text-ink">
            允许学员查看参考答案{visible ? "（已开放）" : "（已关闭）"}
          </div>
          <p className="text-[12px] text-muted mt-0.5 leading-relaxed">
            关闭后，学员新打开或刷新的页面不再提供答案，目标和分级提示仍可查看；管理员始终可见。已看过的答案无法收回。
          </p>
        </div>
      </section>

      <p className="text-[12px] text-muted mb-3 leading-relaxed">
        复测要求先通关，再开启该关全部防护，并在新一轮对话中实际调用防护作用的工具。「实际拦截」才说明防护生效；「已调用，未见拦截」不代表防护有效。
      </p>
      {error && (
        <p role="alert" className="text-[13px] text-danger mb-3">
          {error}
        </p>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-left min-w-[860px]">
          <thead className="bg-sunken/60">
            <tr>
              <th scope="col" className="px-4 py-3 text-[12px] font-medium text-muted w-44">
                学员
              </th>
              {columns.map((c) => (
                <th key={c.scenario_id} scope="col" className="px-3 py-3 align-top">
                  <div className="flex items-center gap-1.5">
                    <TierBadge tier={c.tier} size="sm" />
                    <span className="text-[11px] text-muted tabular-nums">
                      {capturedCount(c.scenario_id)}/{users.length} 通关
                    </span>
                  </div>
                  <div className="text-[12px] font-normal text-ink-2 mt-1 leading-snug">{c.title}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id} className="border-t border-line">
                <th scope="row" className="px-4 py-3 align-top">
                  <div className="text-[13px] font-medium text-ink">{u.display_name}</div>
                  <div className="text-[12px] font-mono font-normal text-muted mt-0.5">{u.username}</div>
                </th>
                {rows
                  .filter((r) => r.user_id === u.user_id)
                  .map((r) => (
                    <Cell key={r.scenario_id} row={r} />
                  ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminFrame>
  );
}

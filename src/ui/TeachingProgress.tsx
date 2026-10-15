"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RETEST_LABELS, type TeachingRow } from "../core/teaching.ts";
import { api, errorText } from "./api";
import { Shell } from "./components/Shell";
import type { Meta, ProgressMap } from "./types";

function time(ts: number | null): string {
  return ts === null ? "—" : new Date(ts * 1000).toLocaleString("zh-CN", { hour12: false });
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
  const users = [...new Map(rows.map((r) => [r.user_id, r])).values()];
  return (
    <Shell active="learn" meta={meta} progress={progress} scenarioCount={scenarioCount}>
      <main className="max-w-7xl mx-auto px-6 py-10 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900 mr-auto">教学进度</h1>
          <Link
            href="/admin"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            账号管理
          </Link>
          <a
            href="/api/admin/progress?format=csv"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            导出 CSV
          </a>
        </div>
        <div className="p-card p-4 space-y-2 text-sm text-slate-600">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={visible}
              disabled={saving}
              onChange={async (e) => {
                const next = e.target.checked;
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
              }}
            />
            允许查看课程答案
          </label>
          <p className="text-xs text-slate-500">
            关闭后，学员新打开或刷新的页面不再提供答案；目标和分级提示仍可查看，管理员始终可见。已看过的答案无法收回。
          </p>
        </div>
        <p className="text-sm text-slate-500">
          每 5
          秒更新。复测记录要求先通关、开启该关全部防护，并在新一轮对话中实际调用相关工具。“未见拦截”不代表防护有效。
        </p>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="p-card overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4">学员</th>
                {rows.slice(0, scenarioCount).map((s) => (
                  <th key={s.scenario_id} className="p-4 min-w-44">
                    {s.tier}
                    <div className="text-xs font-normal mt-1">{s.title}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-t border-slate-200 align-top">
                  <th className="p-4 font-medium text-slate-800">
                    {u.display_name}
                    <div className="text-xs font-normal text-slate-500 mt-1">{u.username}</div>
                  </th>
                  {rows
                    .filter((r) => r.user_id === u.user_id)
                    .map((r) => (
                      <td key={r.scenario_id} className="p-4 space-y-1">
                        <div className={r.captured_at ? "text-emerald-700" : "text-slate-400"}>
                          {r.captured_at ? "已通关" : "未通关"}
                        </div>
                        <div className="text-xs text-slate-500">{time(r.captured_at)}</div>
                        <div className="text-xs text-slate-600 pt-1">
                          {r.outcome ? RETEST_LABELS[r.outcome] : "未复测"}
                        </div>
                        {r.tested_at && <div className="text-xs text-slate-500">{time(r.tested_at)}</div>}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </Shell>
  );
}

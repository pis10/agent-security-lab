"use client";
import { useState } from "react";
import type { Scenario } from "../types";
import { Icon } from "./Icon";

/**逐级展开：先给方向，再给线索，最后才是答案；答案由服务端决定是否下发。 */
export function TaskHints({ scenario }: { scenario: Scenario }) {
  const [count, setCount] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const allHints = count >= scenario.hints.length;
  return (
    <div className="space-y-2.5">
      {scenario.hints.slice(0, count).map((hint, i) => (
        <div key={hint} className="rounded-lg border border-line bg-sunken/60 px-3 py-2.5 rise-in">
          <div className="text-[11px] font-medium text-muted mb-1">提示 {i + 1}</div>
          <p className="text-[13px] leading-relaxed text-ink-2">{hint}</p>
        </div>
      ))}
      {!allHints && (
        <button type="button" className="btn btn-sm w-full" onClick={() => setCount(count + 1)}>
          <Icon name="lightbulb" size={13} />
          {count === 0 ? "卡住了？看提示 1" : `看提示 ${count + 1}`}
          <span className="text-muted font-normal">
            {count + 1}/{scenario.hints.length}
          </span>
        </button>
      )}
      {allHints &&
        (scenario.solution ? (
          showAnswer ? (
            <div className="rounded-lg border border-warn/25 bg-warn-soft/60 px-3 py-2.5 rise-in">
              <div className="text-[11px] font-medium text-warn mb-1">参考答案</div>
              <p className="text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap">{scenario.solution}</p>
            </div>
          ) : (
            <button type="button" className="btn btn-sm w-full" onClick={() => setShowAnswer(true)}>
              <Icon name="eye" size={13} />
              查看参考答案
            </button>
          )
        ) : (
          <p className="text-[12px] text-muted flex items-center gap-1.5">
            <Icon name="lock" size={12} />
            管理员暂未开放答案
          </p>
        ))}
    </div>
  );
}

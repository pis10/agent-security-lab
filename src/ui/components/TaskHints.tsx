"use client";
import { useState } from "react";
import type { Scenario } from "../types";

/**逐级展开，先给方向，再给线索；答案由服务端决定是否提供。 */
export function TaskHints({ scenario }: { scenario: Scenario }) {
  const [count, setCount] = useState(0);
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {scenario.hints.slice(0, count).map((hint, i) => (
        <div key={hint}>
          <div className="text-xs opacity-60 mb-1">提示 {i + 1}</div>
          <p>{hint}</p>
        </div>
      ))}
      {count < scenario.hints.length ? (
        <button type="button" className="underline underline-offset-4" onClick={() => setCount(count + 1)}>
          查看提示 {count + 1}
        </button>
      ) : scenario.solution ? (
        <details>
          <summary className="cursor-pointer underline underline-offset-4">查看答案</summary>
          <p className="mt-3 whitespace-pre-wrap">{scenario.solution}</p>
        </details>
      ) : (
        <p className="text-xs opacity-60">管理员暂未开放答案。</p>
      )}
    </div>
  );
}

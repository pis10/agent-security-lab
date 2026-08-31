import type { CheckResult } from "../types";
import { Icon } from "./Icon";

export function assertionLabel(assertion: Record<string, any>): string {
  if (assertion.sink_received) {
    const s = assertion.sink_received;
    return `通道 [${s.channel ?? "*"}] 收到含 ${s.contains} 的数据`;
  }
  if (assertion.tool_called) {
    const t = assertion.tool_called;
    return `调用工具 ${t.name}${t.args_contains ? `(参数含 ${t.args_contains})` : ""}`;
  }
  if (assertion.tool_result) {
    const t = assertion.tool_result;
    return `工具 ${t.name} 的结果含 ${t.contains}`;
  }
  if (assertion.model_output) return `模型输出含 ${assertion.model_output.contains}`;
  if (assertion.trace_order) return `调用顺序 ${(assertion.trace_order as string[]).join(" → ")}`;
  return JSON.stringify(assertion);
}

export function ObjectiveList({ check }: { check: CheckResult | null }) {
  if (!check)
    return (
      <div className="flex items-center gap-1.5 text-dim text-xs">
        <Icon name="target" size={12} />
        建立会话后显示目标
      </div>
    );
  return (
    <ul className="space-y-1.5">
      {check.results.map((r, i) => (
        <li key={i} className="flex items-start gap-2 text-[13px]" title={r.detail}>
          <Icon
            name={r.passed ? "check" : "target"}
            size={13}
            className={`mt-0.5 ${r.passed ? "text-ok" : "text-dim"}`}
          />
          <span className={r.passed ? "text-ok" : "text-slate-300"}>{assertionLabel(r.assertion)}</span>
        </li>
      ))}
    </ul>
  );
}

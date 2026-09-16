/**Finding 报告生成：场景 + 轨迹证据（Markdown）。 */
import type { Assertion } from "../shared/contracts.ts";
import type { SinkEvent } from "./sinks.ts";
import type { TraceEvent } from "./trace.ts";

interface ReportScenario {
  id: string;
  target: string;
  tier: string;
  title: string;
  brief: string;
  writeup: string;
  assertions: Assertion[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function localTime(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

export function generateReport(
  scenario: ReportScenario,
  sessionId: string,
  traceEvents: TraceEvent[],
  sinkEvents: SinkEvent[],
): string {
  const toolCalls = traceEvents.filter((e) => e.kind === "tool_call");
  const blocked = traceEvents.filter((e) => e.kind === "policy_blocked");

  const chainLines: string[] = [];
  let i = 0;
  for (const ev of toolCalls) {
    i += 1;
    const args = JSON.stringify(ev.data.arguments ?? {});
    chainLines.push(`${i}. \`${ev.data.name}\` 参数: \`${args.slice(0, 200)}\``);
  }
  if (chainLines.length === 0) {
    chainLines.push("（本会话没有工具调用记录）");
  }

  const evidenceLines: string[] = [];
  for (const ev of traceEvents) {
    if (ev.kind === "tool_call") {
      const args = JSON.stringify(ev.data.arguments ?? {});
      evidenceLines.push(`- tool_call \`${ev.data.name}\`: \`${args.slice(0, 300)}\``);
    } else if (ev.kind === "tool_result") {
      evidenceLines.push(`- tool_result \`${ev.data.name}\`: \`${String(ev.data.result).slice(0, 300)}\``);
    } else if (ev.kind === "policy_blocked") {
      evidenceLines.push(`- 🛡 policy_blocked \`${ev.data.defense}\` 拦截 \`${ev.data.tool}\`: ${ev.data.detail ?? ""}`);
    }
  }
  for (const ev of sinkEvents) {
    evidenceLines.push(`- 📤 sink[${ev.channel}] 收到: \`${JSON.stringify(ev.payload).slice(0, 300)}\``);
  }
  if (evidenceLines.length === 0) {
    evidenceLines.push("（无）");
  }

  const defensesHit = [...new Set(blocked.map((e) => String(e.data.defense ?? "?")))].sort();
  const blockedSection =
    defensesHit.length > 0
      ? `\n## 防护拦截记录\n\n本会话中以下防护命中并阻断动作:${defensesHit.map((d) => `\`${d}\``).join("、")}\n`
      : "";

  return `# [${scenario.tier}] ${scenario.title}

- 报告生成时间: ${localTime()}
- 场景 ID: \`${scenario.id}\` · 靶标: \`${scenario.target}\` · 会话: \`${sessionId}\`

## 资产

Agent/靶标 \`${scenario.target}\`(本地靶场,全部 dummy 数据)。

## 前置条件

本地会话;无需用户交互(攻击者扮演用户/外部内容);输入面见攻击链第 1 步。

## 攻击任务

${scenario.brief.trim()}

## 攻击链(trace 证据顺序)

${chainLines.join("\n")}

## 证据

trace 文件: \`data/runtime/worlds/${scenario.target}/trace.jsonl\`

${evidenceLines.join("\n")}
${blockedSection}
## 影响

依据场景断言判定成立;机密性/完整性影响详见下方攻击解析。

## 攻击解析与根因

${scenario.writeup.trim() || "（本关暂未编写解析）"}

## 复测标准

场景断言全部失败且 trace 中出现对应 \`policy_blocked\` 事件,视为修复通过:
${scenario.assertions.map((a) => `- \`${JSON.stringify(a)}\``).join("\n")}
`;
}

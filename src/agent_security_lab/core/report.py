"""Finding report generation (PDF 附录 B template) from scenario + trace evidence."""
from __future__ import annotations

import json
import time
from pathlib import Path

from ..scenario import Scenario
from .sinks import SinkEvent
from .trace import TraceEvent


def generate_report(
    scenario: Scenario,
    session_id: str,
    trace_events: list[TraceEvent],
    sink_events: list[SinkEvent],
) -> str:
    tool_calls = [e for e in trace_events if e.kind == "tool_call"]
    blocked = [e for e in trace_events if e.kind == "policy_blocked"]

    chain_lines = []
    for i, ev in enumerate(tool_calls, 1):
        args = json.dumps(ev.data.get("arguments", {}), ensure_ascii=False)
        chain_lines.append(f"{i}. `{ev.data.get('name')}` 参数: `{args[:200]}`")
    if not chain_lines:
        chain_lines.append("（本会话没有工具调用记录）")

    evidence_lines = []
    for ev in trace_events:
        if ev.kind == "tool_call":
            args = json.dumps(ev.data.get("arguments", {}), ensure_ascii=False)
            evidence_lines.append(f"- tool_call `{ev.data.get('name')}`: `{args[:300]}`")
        elif ev.kind == "tool_result":
            evidence_lines.append(f"- tool_result `{ev.data.get('name')}`: `{str(ev.data.get('result'))[:300]}`")
        elif ev.kind == "policy_blocked":
            defense, tool = ev.data.get("defense"), ev.data.get("tool")
            evidence_lines.append(f"- 🛡 policy_blocked `{defense}` 拦截 `{tool}`: {ev.data.get('detail', '')}")
    for ev in sink_events:
        evidence_lines.append(
            f"- 📤 sink[{ev.channel}] 收到: `{json.dumps(ev.payload, ensure_ascii=False)[:300]}`"
        )
    if not evidence_lines:
        evidence_lines.append("（无）")

    defenses_hit = sorted({e.data.get("defense", "?") for e in blocked})
    blocked_section = (
        "\n## 防护拦截记录\n\n本会话中以下防护命中并阻断动作:" + "、".join(f"`{d}`" for d in defenses_hit) + "\n"
        if defenses_hit
        else ""
    )

    return f"""# [{scenario.tier}] {scenario.title}

- 报告生成时间: {time.strftime("%Y-%m-%d %H:%M:%S")}
- 场景 ID: `{scenario.id}` · 靶标: `{scenario.target}` · 会话: `{session_id}`

## 资产

Agent/靶标 `{scenario.target}`(本地靶场,全部 dummy 数据)。

## 前置条件

本地会话;无需用户交互(攻击者扮演用户/外部内容);输入面见攻击链第 1 步。

## 攻击任务

{scenario.brief.strip()}

## 攻击链(trace 证据顺序)

{chr(10).join(chain_lines)}

## 证据

trace 文件: `traces/{session_id}.jsonl`

{chr(10).join(evidence_lines)}
{blocked_section}
## 影响

依据场景断言判定成立;机密性/完整性影响详见下方攻击解析。

## 攻击解析与根因

{scenario.writeup.strip() or "（本关暂未编写解析）"}

## 复测标准

场景断言全部失败且 trace 中出现对应 `policy_blocked` 事件,视为修复通过:
{chr(10).join(f"- `{json.dumps(a, ensure_ascii=False)}`" for a in scenario.assertions)}
"""


def load_trace_events(trace_dir: Path, session_id: str) -> list[TraceEvent]:
    """Reconstruct events from a session's JSONL trace file (works after close)."""
    path = trace_dir / f"{session_id}.jsonl"
    if not path.exists():
        return []
    events = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            d = json.loads(line)
            events.append(TraceEvent(ts=d["ts"], session_id=d["session_id"], kind=d["kind"], data=d["data"]))
    return events

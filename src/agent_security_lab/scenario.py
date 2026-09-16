"""Scenario loader: YAML-defined challenges, evaluated by the flag engine.

Scenario YAML schema (files in <project>/scenarios/) — 每关只写两段内容：

    id: ticket-idor               # 唯一
    target: support_bot           # 靶标 id
    tier: L2                      # L1 单点 .. L5 组合链
    title: 工单越权读取（IDOR）
    vuln_class: 越权访问（IDOR / BOLA）   # 开课即亮出的漏洞类别
    brief: |                      # 一段式任务书：场景与要点若干行，
      …                           # 末行固定「解决本关：…」（含 flag 工件）
    hints: [...]                  # 卡住时的方向（折叠抽屉）
    assertions:                   # 只认副作用；label 就是「通关判定」checklist 的文案
      - tool_result:
          name: get_ticket
          contains: "<真实感子串>"
          label: get_ticket 返回中出现 flag
    defenses: [...]               # 本关防护（须为靶标 Target.defenses 的子集）
    writeup: |                    # 通关后解锁的一整篇，统一骨架：
      ## 背景原理 / ## 攻击链复盘 / ## 防守复测 / ## 修复对照
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .config import PROJECT_ROOT

SCENARIO_DIR = PROJECT_ROOT / "scenarios"

GOAL_MARK = "解决本关："


@dataclass
class Scenario:
    id: str
    target: str
    tier: str
    title: str
    brief: str
    vuln_class: str = ""
    hints: list[str] = field(default_factory=list)
    assertions: list[dict] = field(default_factory=list)
    defenses: list[dict] = field(default_factory=list)
    writeup: str = ""

    @property
    def goal(self) -> str:
        """任务书末行「解决本关：」之后的目标句；没写标记则退回整段。"""
        idx = self.brief.rfind(GOAL_MARK)
        return self.brief[idx + len(GOAL_MARK):].strip() if idx >= 0 else self.brief.strip()

    @property
    def context(self) -> str:
        """「解决本关：」之前的场景与要点。"""
        idx = self.brief.rfind(GOAL_MARK)
        return self.brief[:idx].strip() if idx >= 0 else ""


def load_scenarios(directory: Path | None = None) -> list[Scenario]:
    directory = directory or SCENARIO_DIR
    scenarios: list[Scenario] = []
    if not directory.exists():
        return scenarios
    for path in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        scenarios.append(Scenario(**data))
    return scenarios


def get_scenario(scenario_id: str, directory: Path | None = None) -> Scenario | None:
    for s in load_scenarios(directory):
        if s.id == scenario_id:
            return s
    return None

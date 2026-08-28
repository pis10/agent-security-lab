"""Scenario loader: YAML-defined challenges, evaluated by the flag engine.

Scenario YAML schema (files in <project>/scenarios/):

    id: mail-indirect-exfil          # unique
    target: mail_agent               # target id
    tier: L3                         # L1 single-point .. L5 full chain
    title: 邮件间接注入外发
    briefing: |                      # attacker-tasking shown in the UI
      ...
    hints: [...]                     # progressive hints
    assertions:                      # evaluated by core.flags.evaluate
      - tool_called: {name: read_email}
      - sink_received: {channel: email, contains: TEST_SECRET_MAIL}
    defenses:                        # optional: toggles relevant to this scenario
      - id: confirm_gate
        name: 人工确认门
        description: 发送前必须人工确认
    writeup: |                       # optional: full PortSwigger-style walkthrough
      ...
    fix_notes: |                     # defense counterpoint (root cause + fix)
      ...
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

from .config import PROJECT_ROOT

SCENARIO_DIR = PROJECT_ROOT / "scenarios"


@dataclass
class Scenario:
    id: str
    target: str
    tier: str
    title: str
    briefing: str
    hints: list[str] = field(default_factory=list)
    assertions: list[dict] = field(default_factory=list)
    defenses: list[dict] = field(default_factory=list)
    writeup: str = ""
    fix_notes: str = ""


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

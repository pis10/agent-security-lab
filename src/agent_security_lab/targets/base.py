"""Target contract: a deliberately vulnerable agent application.

A Target bundles: system prompt, tool set, seeding/lifecycle hooks,
and a scripted MockLLM attack chain (`mock_scripts[scenario_id]`) so each
lesson can replay offline. Free-roam (no scenario) uses `idle_script`.

Range UI keeps one persistent world per target (data/runtime/worlds/<id>/);
seed() attaches if files exist and only copies seeds when missing.
Redteam still uses ephemeral data/runtime/<session_id>/ with force_seed.

Wiring:
    ctx = ToolContext(...)
    target.seed(ctx)
    target.on_session_start(ctx)
    tools = target.build_tools(ctx)
    agent = Agent(...)
    ...
    target.on_session_end(ctx)
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from ..core.llm import ScriptItem, scripted
from ..core.tools import Tool, ToolContext


def _noop(ctx: ToolContext) -> None:
    return None


def _empty_tools(ctx: ToolContext) -> list[Tool]:
    return []


def _default_idle_script(_ctx: ToolContext) -> list[ScriptItem]:
    """Free-roam mock: a single helpful reply, no tools, no attack chain."""
    return [scripted(content="好的，我在。需要我做什么？")]


# A mock script is either a static list, or a factory receiving the session
# context (needed when the scripted attack must embed ctx.base_url).
MockScript = list[ScriptItem] | Callable[[ToolContext], list[ScriptItem]]


@dataclass
class Defense:
    """A toggleable hardening measure. Tools enforce it by checking
    `ctx.state["defenses"]` and must record a `policy_blocked` trace event
    when they stop an action."""
    id: str
    name: str
    description: str


@dataclass
class Target:
    id: str
    name: str
    tier_focus: str  # which attack surface this target exercises
    description: str
    system_prompt: str
    build_tools: Callable[[ToolContext], list[Tool]] = _empty_tools
    seed: Callable[[ToolContext], None] = _noop
    on_session_start: Callable[[ToolContext], None] = _noop
    on_session_end: Callable[[ToolContext], None] = _noop
    mock_script: MockScript = field(default_factory=list)  # default/smoke attack chain
    mock_scripts: dict[str, MockScript] = field(default_factory=dict)  # per-scenario chains
    idle_script: MockScript | None = None  # free-roam mock (no scenario); never an attack
    defenses: list[Defense] = field(default_factory=list)
    sim_state: Callable[[ToolContext], dict] | None = None  # data for the simulated product UI

    def build_mock_script(self, ctx: ToolContext, scenario_id: str | None = None) -> list[ScriptItem]:
        if scenario_id:
            script = self.mock_scripts.get(scenario_id)
            if script is None:
                script = self.mock_script
            return script(ctx) if callable(script) else list(script)
        idle = self.idle_script if self.idle_script is not None else _default_idle_script
        return idle(ctx) if callable(idle) else list(idle)

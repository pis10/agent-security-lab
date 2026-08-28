"""Target contract: a deliberately vulnerable agent application.

A Target bundles: system prompt, tool set, per-session seeding/lifecycle hooks,
and a scripted MockLLM attack chain (`mock_script`) so the smoke scenario runs
deterministically offline and in CI.

Session wiring order (web app and test helpers both follow this):
    ctx = ToolContext(...)
    target.seed(ctx)             # populate ctx.state, per-session files
    target.on_session_start(ctx) # e.g. launch MCP servers, stash clients in ctx.state
    tools = target.build_tools(ctx)
    agent = Agent(llm, ToolRegistry(tools), target.system_prompt, tracer)
    ...
    target.on_session_end(ctx)   # must release processes/resources
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from ..core.llm import ScriptItem
from ..core.tools import Tool, ToolContext


def _noop(ctx: ToolContext) -> None:
    return None


def _empty_tools(ctx: ToolContext) -> list[Tool]:
    return []


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
    defenses: list[Defense] = field(default_factory=list)
    sim_state: Callable[[ToolContext], dict] | None = None  # data for the simulated product UI

    def build_mock_script(self, ctx: ToolContext, scenario_id: str | None = None) -> list[ScriptItem]:
        script = self.mock_scripts.get(scenario_id) if scenario_id else None
        if script is None:
            script = self.mock_script
        return script(ctx) if callable(script) else list(script)

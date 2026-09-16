"""Target contract: a deliberately vulnerable agent application.

A Target bundles system prompt, tool set, seeding/lifecycle hooks, and
optional product-UI state. Range UI keeps one persistent world per target
(data/runtime/worlds/<id>/); seed() attaches if files exist and only copies
seeds when missing. Redteam still uses ephemeral data/runtime/<session_id>/
with force_seed.

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

from ..core.tools import Tool, ToolContext


def _noop(ctx: ToolContext) -> None:
    return None


def _empty_tools(ctx: ToolContext) -> list[Tool]:
    return []


def _no_act(ctx: ToolContext, action: str, args: dict) -> dict:
    raise ValueError("该产品没有这项操作")


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
    defenses: list[Defense] = field(default_factory=list)
    sim_state: Callable[[ToolContext], dict] | None = None  # data for the simulated product UI
    act: Callable[[ToolContext, str, dict], dict] = _no_act  # player write actions

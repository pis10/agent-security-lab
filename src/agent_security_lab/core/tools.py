"""Tool model: a tool is a real capability handed to the model.

Security note (by design): `description` is part of the attack surface — it is
shown to the model verbatim and may be poisoned in MCP scenarios.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from ..config import Config
from .trace import Tracer


@dataclass
class ToolContext:
    """Per-session state handed to every tool invocation."""
    session_id: str
    tracer: Tracer
    config: Config
    state: dict = field(default_factory=dict)  # per-session scratch (inboxes, memory, cwd...)

    @property
    def base_url(self) -> str:
        return f"http://{self.config.host}:{self.config.port}"


ToolHandler = Callable[[dict, ToolContext], str]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict  # JSON Schema object
    handler: ToolHandler

    def schema(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolRegistry:
    def __init__(self, tools: list[Tool] | None = None):
        self._tools: dict[str, Tool] = {}
        for t in tools or []:
            self.register(t)

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    @property
    def names(self) -> list[str]:
        return list(self._tools)

    def schemas(self) -> list[dict]:
        return [t.schema() for t in self._tools.values()]

    def call(self, name: str, arguments: dict, ctx: ToolContext) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return f"[error] unknown tool: {name}. Available: {', '.join(self.names)}"
        try:
            result = tool.handler(arguments, ctx)
        except Exception as exc:  # tool errors flow back to the model, as in real apps
            return f"[error] tool {name} failed: {exc}"
        return result if isinstance(result, str) else str(result)


def obj_schema(properties: dict[str, dict], required: list[str] | None = None) -> dict:
    """Small helper to declare JSON object schemas."""
    return {
        "type": "object",
        "properties": properties,
        "required": required or list(properties),
        "additionalProperties": False,
    }


def str_prop(description: str) -> dict:
    return {"type": "string", "description": description}

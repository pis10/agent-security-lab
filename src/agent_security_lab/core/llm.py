"""LLM backends: OpenAI-compatible client (default Kimi K2.7 Code) + scripted MockLLM."""
from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol

from ..config import Config


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict
    arguments_json: str  # raw JSON string, needed to replay assistant messages


@dataclass
class LLMResponse:
    content: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)
    reasoning: str | None = None


class LLM(Protocol):
    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> LLMResponse: ...


class LLMClient:
    """OpenAI-compatible chat client. Kimi's reasoning models return
    `reasoning_content` and may produce empty content alongside tool_calls —
    both are handled here. `max_tokens` is generous because reasoning burns tokens."""

    def __init__(self, config: Config, max_tokens: int = 8192, temperature: float = 1.0):
        # kimi-for-coding rejects any temperature other than 1; keep 1.0 default.
        from openai import OpenAI

        self._client = OpenAI(base_url=config.llm_base_url, api_key=config.llm_api_key)
        self._model = config.llm_model
        self._max_tokens = max_tokens
        self._temperature = temperature

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> LLMResponse:
        kwargs: dict = {}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        resp = self._client.chat.completions.create(
            model=self._model,
            messages=messages,
            max_tokens=self._max_tokens,
            temperature=self._temperature,
            **kwargs,
        )
        msg = resp.choices[0].message
        tool_calls = []
        for tc in msg.tool_calls or []:
            args_json = tc.function.arguments or "{}"
            try:
                args = json.loads(args_json)
            except json.JSONDecodeError:
                args = {"_raw": args_json}
            tool_calls.append(ToolCall(id=tc.id, name=tc.function.name, arguments=args, arguments_json=args_json))
        return LLMResponse(
            content=msg.content or None,
            tool_calls=tool_calls,
            reasoning=getattr(msg, "reasoning_content", None),
        )


# A script item is either a ready LLMResponse or a function inspecting the
# conversation so far (useful to react to tool results in scripted attacks).
ScriptItem = LLMResponse | Callable[[list[dict]], LLMResponse]


class MockLLM:
    """Deterministic, offline stand-in: pops scripted responses in order."""

    def __init__(self, script: list[ScriptItem]):
        self._script = list(script)
        self.calls: int = 0

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> LLMResponse:
        self.calls += 1
        if not self._script:
            return LLMResponse(content="[mock] script exhausted")
        item = self._script.pop(0)
        return item(messages) if callable(item) else item


def scripted(content: str | None = None, tool_calls: list[tuple[str, dict]] | None = None) -> LLMResponse:
    """Helper to build one scripted MockLLM response."""
    tcs = [
        ToolCall(id=f"mock_tc_{i}", name=name, arguments=args, arguments_json=json.dumps(args))
        for i, (name, args) in enumerate(tool_calls or [])
    ]
    return LLMResponse(content=content, tool_calls=tcs)


def build_llm(config: Config, mock_script: list[ScriptItem] | None = None) -> LLM:
    if config.use_mock_llm or mock_script is not None:
        return MockLLM(mock_script or [])
    return LLMClient(config)

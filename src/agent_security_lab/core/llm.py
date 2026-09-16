"""OpenAI-compatible chat client (default: GLM Coding Plan / glm-5.3-flash)."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Protocol

from ..config import Config

try:  # openai is a hard dependency; keep import lazy-safe for doc builds
    from openai import APITimeoutError
except ImportError:  # pragma: no cover
    APITimeoutError = Exception  # type: ignore[assignment,misc]


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
    """OpenAI-compatible chat client. GLM reasoning models return
    `reasoning_content` and may produce empty content alongside tool_calls —
    both are handled here. `max_tokens` is generous in case thinking is enabled."""

    def __init__(self, config: Config, max_tokens: int = 8192):
        from openai import OpenAI

        # SDK 默认 timeout=600s，远端挂住时一次调用能阻塞半小时；靶场要快速失败
        self._client = OpenAI(
            base_url=config.llm_base_url, api_key=config.llm_api_key, timeout=120.0, max_retries=1
        )
        self._model = config.llm_model
        self._max_tokens = max_tokens
        self._temperature = config.llm_temperature
        self._thinking = config.llm_thinking

    def chat(self, messages: list[dict], tools: list[dict] | None = None) -> LLMResponse:
        kwargs: dict = {}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        if self._thinking:
            kwargs["extra_body"] = {"thinking": {"type": self._thinking}}
        try:
            resp = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                max_tokens=self._max_tokens,
                temperature=self._temperature,
                **kwargs,
            )
        except APITimeoutError as exc:
            raise RuntimeError(
                f"LLM 请求超时（{self._model}）：端点无响应。可稍后重试；若持续超时，"
                "检查 ASL_LLM_BASE_URL 是否为订阅对应的端点。"
            ) from exc
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


def build_llm(config: Config) -> LLM:
    return LLMClient(config)

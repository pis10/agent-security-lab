"""Minimal tool-calling agent loop, shared by all targets.

Intentionally plain: targets are vulnerable by *configuration and tool design*,
not by framework trickery. Turn budget guards against runaway loops.
"""
from __future__ import annotations

from .llm import LLM, LLMResponse
from .tools import ToolContext, ToolRegistry
from .trace import Tracer


class Agent:
    def __init__(
        self,
        llm: LLM,
        tools: ToolRegistry,
        system_prompt: str,
        tracer: Tracer,
        max_turns: int = 10,
    ):
        self.llm = llm
        self.tools = tools
        self.tracer = tracer
        self.max_turns = max_turns
        self._messages: list[dict] = [{"role": "system", "content": system_prompt}]

    @property
    def messages(self) -> list[dict]:
        return list(self._messages)

    def run(self, user_message: str, ctx: ToolContext) -> str:
        self.tracer.record("user_msg", content=user_message)
        self._messages.append({"role": "user", "content": user_message})

        for _ in range(self.max_turns):
            resp = self.llm.chat(self._messages, self.tools.schemas() or None)
            self.tracer.record(
                "model_msg",
                content=resp.content,
                reasoning=resp.reasoning,
                tool_calls=[{"name": tc.name, "arguments": tc.arguments} for tc in resp.tool_calls],
            )
            if not resp.tool_calls:
                final = resp.content or ""
                self._messages.append({"role": "assistant", "content": final})
                return final

            self._messages.append(_assistant_tool_msg(resp))
            for tc in resp.tool_calls:
                self.tracer.record("tool_call", id=tc.id, name=tc.name, arguments=tc.arguments)
                result = self.tools.call(tc.name, tc.arguments, ctx)
                self.tracer.record("tool_result", id=tc.id, name=tc.name, result=result[:4000])
                self._messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "name": tc.name, "content": result}
                )

        note = "[budget] max tool turns reached; stopping the loop"
        self.tracer.record("note", text=note)
        return note


def _assistant_tool_msg(resp: LLMResponse) -> dict:
    return {
        "role": "assistant",
        "content": resp.content or "",
        "tool_calls": [
            {
                "id": tc.id,
                "type": "function",
                "function": {"name": tc.name, "arguments": tc.arguments_json},
            }
            for tc in resp.tool_calls
        ],
    }

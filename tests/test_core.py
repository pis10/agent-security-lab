"""Unit tests: agent loop, tracer persistence, scenario loader."""
from agent_security_lab.config import load_config
from agent_security_lab.core import (
    Agent,
    MockLLM,
    Tool,
    ToolContext,
    ToolRegistry,
    Tracer,
    obj_schema,
    scripted,
    str_prop,
)
from agent_security_lab.scenario import load_scenarios


def test_agent_loop_records_full_chain():
    def echo(args, ctx):
        return f"echoed: {args['text']}"

    registry = ToolRegistry([
        Tool(name="echo", description="Echo", parameters=obj_schema({"text": str_prop("t")}), handler=echo)
    ])
    tracer = Tracer(session_id="unit-agent")
    ctx = ToolContext(session_id="unit-agent", tracer=tracer, config=load_config())
    llm = MockLLM([scripted(tool_calls=[("echo", {"text": "hi"})]), scripted(content="done")])
    agent = Agent(llm, registry, "sys", tracer)
    assert agent.run("go", ctx) == "done"
    kinds = [e.kind for e in tracer.events]
    assert kinds == ["user_msg", "model_msg", "tool_call", "tool_result", "model_msg"]


def test_agent_turn_budget():
    registry = ToolRegistry([
        Tool(name="noop", description="n", parameters=obj_schema({}), handler=lambda a, c: "ok")
    ])
    tracer = Tracer(session_id="unit-budget")
    ctx = ToolContext(session_id="unit-budget", tracer=tracer, config=load_config())
    llm = MockLLM([scripted(tool_calls=[("noop", {})])] * 50)
    agent = Agent(llm, registry, "sys", tracer, max_turns=3)
    out = agent.run("go", ctx)
    assert "budget" in out
    assert len(tracer.tool_call_events()) == 3


def test_tracer_persists_jsonl(tmp_path):
    tracer = Tracer(session_id="unit-persist", trace_dir=tmp_path)
    tracer.record("note", text="hello")
    tracer.close()
    content = (tmp_path / "unit-persist.jsonl").read_text()
    assert '"kind": "note"' in content and "hello" in content


def test_scenario_loader_finds_all_smoke_scenarios():
    scenarios = load_scenarios()
    ids = {s.id for s in scenarios}
    assert {
        "smoke-support-bot",
        "smoke-devops-assistant",
        "smoke-mail-agent",
        "smoke-mcp-playground",
        "smoke-browser-agent",
    } <= ids
    for s in scenarios:
        assert s.assertions, f"{s.id} has no assertions"
        assert s.briefing and s.tier.startswith("L")

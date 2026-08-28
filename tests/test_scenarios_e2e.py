"""End-to-end scenario regression: every scenario must be replayable via its
scripted MockLLM attack chain, and every scenario with defenses must be blocked
when those defenses are enabled (attack → harden → retest loop).

Runs fully offline (MockLLM); no API key required.
"""
import pytest

from agent_security_lab.config import PROJECT_ROOT
from agent_security_lab.core import SINKS, evaluate
from agent_security_lab.scenario import load_scenarios
from agent_security_lab.targets import get_target
from agent_security_lab.testing import live_sinks, run_mock_attack
from agent_security_lab.testing import test_config as make_config

SCENARIOS = load_scenarios()
MEMORY_FILE = PROJECT_ROOT / "data" / "runtime" / "mail_agent_memory.json"


@pytest.fixture(autouse=True)
def _clean_shared_memory():
    """mail_agent memory is target-global by design (memory-poisoning scenario);
    keep tests hermetic by resetting it around each test."""
    if MEMORY_FILE.exists():
        MEMORY_FILE.write_text("[]", encoding="utf-8")
    yield
    if MEMORY_FILE.exists():
        MEMORY_FILE.write_text("[]", encoding="utf-8")


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s.id for s in SCENARIOS])
def test_scenario_attack_replayable(scenario):
    config = make_config()
    with live_sinks(config):
        tracer, _ = run_mock_attack(get_target(scenario.target), config, scenario_id=scenario.id)
        results = evaluate(scenario.assertions, tracer, SINKS, tracer.session_id)
    failures = [r.detail for r in results if not r.passed]
    assert not failures, f"{scenario.id} replay failed: {failures}"


@pytest.mark.parametrize(
    "scenario", [s for s in SCENARIOS if s.defenses], ids=[s.id for s in SCENARIOS if s.defenses]
)
def test_scenario_blocked_when_hardened(scenario):
    defenses = {d["id"] if isinstance(d, dict) else d for d in scenario.defenses}
    config = make_config()
    with live_sinks(config):
        tracer, _ = run_mock_attack(
            get_target(scenario.target), config, scenario_id=scenario.id, defenses=defenses
        )
        blocked = any(e.kind == "policy_blocked" for e in tracer.events)
        results = evaluate(scenario.assertions, tracer, SINKS, tracer.session_id)
    assert blocked, f"{scenario.id}: defense enabled but no policy_blocked event"
    assert not all(r.passed for r in results), f"{scenario.id}: attack still passes with defenses on"

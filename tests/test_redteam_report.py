"""Red team driver + report generation tests (offline, MockLLM)."""
import dataclasses

import pytest

from agent_security_lab.config import PROJECT_ROOT
from agent_security_lab.core.report import generate_report
from agent_security_lab.redteam import run_redteam
from agent_security_lab.scenario import load_scenarios
from agent_security_lab.targets import get_target
from agent_security_lab.testing import live_sinks, run_mock_attack
from agent_security_lab.testing import test_config as make_config

MEMORY_FILE = PROJECT_ROOT / "data" / "runtime" / "mail_agent_memory.json"


@pytest.fixture(autouse=True)
def _clean_shared_memory():
    if MEMORY_FILE.exists():
        MEMORY_FILE.write_text("[]", encoding="utf-8")
    yield
    if MEMORY_FILE.exists():
        MEMORY_FILE.write_text("[]", encoding="utf-8")


def _scenario(scenario_id: str):
    return next(s for s in load_scenarios() if s.id == scenario_id)


def test_redteam_mock_replay_succeeds():
    """Mock mode: attacker says one line, target replays its scripted chain —
    a single run must complete the scenario."""
    scenario = _scenario("smoke-support-bot")
    target = get_target(scenario.target)
    config = dataclasses.replace(make_config(), use_mock_llm=True)
    with live_sinks(config):
        result = run_redteam(scenario, target, config, runs=1, max_turns=3, progress=lambda _: None)
    assert result.success_rate == 1.0, f"mock redteam failed: {result.details}"
    assert result.details[0].turns_used == 1


def test_report_contains_evidence():
    """A replayed attack's report must cite the scenario and the exfiltrated secret."""
    scenario = _scenario("smoke-mail-agent")
    config = make_config()
    with live_sinks(config):
        tracer, _ = run_mock_attack(get_target(scenario.target), config, scenario_id=scenario.id)
    report = generate_report(scenario, tracer.session_id, tracer.events, [])
    assert scenario.title in report
    assert "TEST_SECRET_MAIL_VAULT" in report
    assert tracer.session_id in report

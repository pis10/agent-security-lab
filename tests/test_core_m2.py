"""Tests for M2 core additions: ProgressDB, tool_result assertion, new API endpoints."""
from fastapi.testclient import TestClient

from agent_security_lab.core import SINKS, Tracer, evaluate
from agent_security_lab.core.db import ProgressDB
from agent_security_lab.web.app import app


def test_progress_db_roundtrip(tmp_path):
    db = ProgressDB(path=tmp_path / "progress.db")
    assert db.captured() == {}
    db.record_capture("smoke-mail-agent", "sess1", ["confirm_gate"])
    db.record_capture("smoke-mail-agent", "sess2", [])  # idempotent per scenario
    db.record_capture("smoke-support-bot", "sess1", [])
    captured = db.captured()
    assert set(captured) == {"smoke-mail-agent", "smoke-support-bot"}
    assert captured["smoke-mail-agent"]["session_id"] == "sess2"  # INSERT OR REPLACE keeps latest


def test_tool_result_assertion():
    tracer = Tracer(session_id="tr1")
    tracer.record("tool_call", id="1", name="run_script", arguments={"filename": "a.txt; echo TEST_CMD_PROOF"})
    tracer.record("tool_result", id="1", name="run_script", result="ok\nTEST_CMD_PROOF")
    ok = evaluate([{"tool_result": {"name": "run_script", "contains": "TEST_CMD_PROOF"}}], tracer, SINKS, "tr1")[0]
    bad = evaluate([{"tool_result": {"name": "run_script", "contains": "ABSENT"}}], tracer, SINKS, "tr1")[0]
    assert ok.passed and not bad.passed


def test_api_session_lifecycle_and_new_endpoints():
    client = TestClient(app)
    targets = client.get("/api/targets").json()
    assert len(targets) == 5
    assert all("defenses" in t for t in targets)

    sid = client.post("/api/sessions", json={"target_id": "support_bot"}).json()["session_id"]
    assert client.get(f"/api/sessions/{sid}/sim").status_code == 200
    assert client.get(f"/api/sessions/{sid}/sink").json() == []
    assert client.get(f"/api/sessions/{sid}/trace").json() == []

    check = client.post(f"/api/sessions/{sid}/check", json={"scenario_id": "smoke-support-bot"}).json()
    assert check["passed"] is False

    assert isinstance(client.get("/api/progress").json(), dict)
    assert client.delete(f"/api/sessions/{sid}").json() == {"ok": True}
    assert client.get(f"/api/sessions/{sid}/trace").status_code == 404


def test_api_rejects_unknown_defense():
    client = TestClient(app)
    resp = client.post("/api/sessions", json={"target_id": "support_bot", "enabled_defenses": ["nope"]})
    assert resp.status_code == 400

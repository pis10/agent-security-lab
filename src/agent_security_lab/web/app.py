"""Web app: sessions, chat, trace, scenario checks, progress + mock sinks/sites.

Everything binds 127.0.0.1 and uses dummy data only — the range is for local,
authorized learning. Serves frontend/dist when built, else the legacy static page.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import asdict, dataclass, field

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ..config import PROJECT_ROOT, Config, load_config
from ..core.agent import Agent
from ..core.db import ProgressDB
from ..core.flags import evaluate
from ..core.llm import MockLLM, build_llm
from ..core.sinks import SINKS, build_sink_router
from ..core.tools import ToolContext, ToolRegistry
from ..core.trace import Tracer
from ..scenario import get_scenario, load_scenarios
from ..targets import get_target, list_targets
from ..targets.base import Target

logger = logging.getLogger("asl.web")

LEGACY_STATIC_DIR = PROJECT_ROOT / "src" / "agent_security_lab" / "web" / "static"
SITES_DIR = PROJECT_ROOT / "data" / "seeds" / "browser_agent" / "sites"
DIST_DIR = PROJECT_ROOT / "frontend" / "dist"

config: Config = load_config()
progress_db = ProgressDB()


@dataclass
class Session:
    id: str
    target: Target
    ctx: ToolContext
    agent: Agent
    tracer: Tracer
    scenario_id: str | None = None
    created: float = field(default_factory=time.time)


class SessionManager:
    def __init__(self):
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def create(self, target_id: str, scenario_id: str | None, enabled_defenses: list[str]) -> Session:
        if not config.llm_available:
            raise HTTPException(
                status_code=400,
                detail="未配置 LLM Key:请复制 .env.example 为 .env 并填入 ASL_LLM_API_KEY,"
                "或用 ASL_USE_MOCK_LLM=1 启动离线 mock 模式。",
            )
        target = get_target(target_id)  # raises KeyError for unknown id
        valid_defenses = {d.id for d in target.defenses}
        unknown = set(enabled_defenses) - valid_defenses
        if unknown:
            raise HTTPException(status_code=400, detail=f"unknown defenses: {sorted(unknown)}")

        tracer = Tracer(trace_dir=config.trace_dir)
        ctx = ToolContext(session_id=tracer.session_id, tracer=tracer, config=config)
        ctx.state["defenses"] = set(enabled_defenses)
        target.seed(ctx)
        target.on_session_start(ctx)
        try:
            if config.use_mock_llm:
                llm = MockLLM(target.build_mock_script(ctx, scenario_id))
            else:
                llm = build_llm(config)
            agent = Agent(llm, ToolRegistry(target.build_tools(ctx)), target.system_prompt, tracer)
        except Exception:
            target.on_session_end(ctx)
            raise
        session = Session(
            id=tracer.session_id, target=target, ctx=ctx, agent=agent, tracer=tracer, scenario_id=scenario_id
        )
        with self._lock:
            self._sessions[session.id] = session
        logger.info("session %s created for target %s (defenses=%s)", session.id, target_id, enabled_defenses)
        return session

    def get(self, session_id: str) -> Session:
        session = self._sessions.get(session_id)
        if session is None:
            raise HTTPException(status_code=404, detail=f"unknown session {session_id}")
        return session

    def close(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session:
            session.target.on_session_end(session.ctx)
            session.tracer.close()
            logger.info("session %s closed", session_id)


SESSIONS = SessionManager()

app = FastAPI(title="agent-security-lab", docs_url=None, redoc_url=None)
app.include_router(build_sink_router())
if SITES_DIR.exists():
    app.mount("/sites", StaticFiles(directory=SITES_DIR), name="sites")
try:
    from ..targets.mcp_playground.mock_remote import build_mock_remote_router

    app.include_router(build_mock_remote_router())
except Exception:
    logger.warning("mcp_playground mock_remote router unavailable", exc_info=True)


class CreateSessionBody(BaseModel):
    target_id: str
    scenario_id: str | None = None
    enabled_defenses: list[str] = []


class ChatBody(BaseModel):
    message: str


class CheckBody(BaseModel):
    scenario_id: str


@app.get("/api/meta")
def meta() -> dict:
    return {
        "llm_mode": "mock" if config.use_mock_llm else "live",
        "llm_model": None if config.use_mock_llm else config.llm_model,
    }


@app.get("/api/targets")
def api_targets() -> list[dict]:
    return [
        {
            "id": t.id,
            "name": t.name,
            "tier_focus": t.tier_focus,
            "description": t.description,
            "defenses": [asdict(d) for d in t.defenses],
        }
        for t in list_targets()
    ]


@app.get("/api/scenarios")
def api_scenarios() -> list[dict]:
    return [asdict(s) for s in load_scenarios()]


@app.get("/api/progress")
def api_progress() -> dict:
    return progress_db.captured()


@app.post("/api/sessions")
def api_create_session(body: CreateSessionBody) -> dict:
    try:
        session = SESSIONS.create(body.target_id, body.scenario_id, body.enabled_defenses)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "session_id": session.id,
        "target_id": body.target_id,
        "enabled_defenses": sorted(session.ctx.state["defenses"]),
    }


@app.post("/api/sessions/{session_id}/chat")
def api_chat(session_id: str, body: ChatBody) -> dict:
    session = SESSIONS.get(session_id)
    reply = session.agent.run(body.message, session.ctx)
    return {"reply": reply}


@app.get("/api/sessions/{session_id}/trace")
def api_trace(session_id: str) -> list[dict]:
    session = SESSIONS.get(session_id)
    return [asdict(e) for e in session.tracer.events]


@app.get("/api/sessions/{session_id}/sim")
def api_sim(session_id: str) -> dict:
    session = SESSIONS.get(session_id)
    if session.target.sim_state is None:
        return {}
    return session.target.sim_state(session.ctx)


@app.get("/api/sessions/{session_id}/sink")
def api_sink(session_id: str, channel: str | None = Query(default=None)) -> list[dict]:
    SESSIONS.get(session_id)  # 404 guard
    return [asdict(e) for e in SINKS.received(channel=channel, session_id=session_id)]


@app.post("/api/sessions/{session_id}/check")
def api_check(session_id: str, body: CheckBody) -> dict:
    session = SESSIONS.get(session_id)
    scenario = get_scenario(body.scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"unknown scenario {body.scenario_id}")
    results = evaluate(scenario.assertions, session.tracer, SINKS, session.id)
    passed = all(r.passed for r in results)
    if passed:
        progress_db.record_capture(
            scenario.id, session.id, sorted(session.ctx.state.get("defenses", set()))
        )
        logger.info("FLAG captured: %s (session %s)", scenario.id, session.id)
    return {
        "scenario_id": scenario.id,
        "passed": passed,
        "results": [{"assertion": r.assertion, "passed": r.passed, "detail": r.detail} for r in results],
    }


@app.delete("/api/sessions/{session_id}")
def api_close_session(session_id: str) -> dict:
    SESSIONS.close(session_id)
    return {"ok": True}


@app.get("/api/sessions/{session_id}/report")
def api_report(session_id: str, scenario_id: str) -> PlainTextResponse:
    """Generate a finding report (markdown) from the session's trace + sinks."""
    from ..core.report import generate_report

    session = SESSIONS.get(session_id)
    scenario = get_scenario(scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"unknown scenario {scenario_id}")
    sink_events = SINKS.received(session_id=session_id)
    return PlainTextResponse(
        generate_report(scenario, session_id, session.tracer.events, sink_events),
        media_type="text/markdown; charset=utf-8",
    )


# Static frontend: prefer the built React app; fall back to the legacy page.
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
else:
    logger.info("frontend/dist not found — serving legacy UI. Build with: cd frontend && npm run build")

    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(LEGACY_STATIC_DIR / "index.html")

    app.mount("/static", StaticFiles(directory=LEGACY_STATIC_DIR), name="static")

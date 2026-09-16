"""Web app: product worlds, chat, trace, progress + sink inbox / sites.

Everything binds 127.0.0.1 and uses dummy data only — the range is for local,
authorized learning. Serves frontend/dist when built.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from dataclasses import asdict

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from ..config import PROJECT_ROOT, load_config
from ..core.db import WORLDS_DIR, ProgressDB
from ..core.flags import evaluate
from ..core.sinks import SINKS, build_sink_router
from ..scenario import Scenario, get_scenario, load_scenarios
from ..targets import list_targets
from .worlds import World, WorldManager

logger = logging.getLogger("asl.web")

SITES_DIR = PROJECT_ROOT / "data" / "seeds" / "browser_agent" / "sites"
DIST_DIR = PROJECT_ROOT / "frontend" / "dist"

config = load_config()
progress_db = ProgressDB()
WORLDS = WorldManager(config)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    WORLDS.shutdown()


app = FastAPI(title="agent-security-lab", docs_url=None, redoc_url=None, lifespan=lifespan)
app.include_router(build_sink_router())


def _site_file(filename: str):
    if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
        return None
    world = WORLDS_DIR / "browser_agent" / "sites" / filename
    seed = SITES_DIR / filename
    for path in (world, seed):
        if path.is_file():
            return path
    return None


@app.get("/sites/{filename}")
def serve_site(filename: str):
    path = _site_file(filename)
    if path is None:
        raise HTTPException(status_code=404, detail="not found")
    return FileResponse(path, media_type="text/html; charset=utf-8")


try:
    from ..targets.mcp_playground.mock_remote import build_mock_remote_router

    app.include_router(build_mock_remote_router())
except Exception:
    logger.warning("mcp_playground mock_remote router unavailable", exc_info=True)


class EnsureWorldBody(BaseModel):
    scenario_id: str | None = None


class ChatBody(BaseModel):
    message: str


class DefensesBody(BaseModel):
    enabled_defenses: list[str] = []


class ActBody(BaseModel):
    action: str
    args: dict = {}


def _world_or_404(target_id: str, scenario_id: str | None = None) -> World:
    try:
        return WORLDS.ensure(target_id, scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _assertion_label(assertion: dict) -> str | None:
    spec = next(iter(assertion.values()), None) if assertion else None
    return spec.get("label") if isinstance(spec, dict) else None


def _evaluate_scenario(world: World, scenario: Scenario) -> dict:
    results = evaluate(scenario.assertions, world.tracer, SINKS, world.target_id)
    passed = all(r.passed for r in results) if results else False
    if passed:
        already = scenario.id in progress_db.captured()
        progress_db.record_capture(
            scenario.id, world.target_id, sorted(world.ctx.state.get("defenses", set()))
        )
        if not already:
            logger.info("FLAG captured: %s (world %s)", scenario.id, world.target_id)
    checks = [
        {"label": _assertion_label(r.assertion) or r.detail, "passed": r.passed}
        for r in results
    ]
    return {
        "scenario_id": scenario.id,
        "title": scenario.title,
        "tier": scenario.tier,
        "passed": passed,
        "passed_count": sum(1 for r in results if r.passed),
        "total": len(results),
        "checks": checks,
    }


@app.get("/api/meta")
def meta() -> dict:
    return {"llm_model": config.llm_model}


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


@app.get("/api/worlds")
def api_list_worlds() -> list[dict]:
    return [{k: v for k, v in w.items() if k != "messages"} for w in WORLDS.list()]


@app.post("/api/worlds/{target_id}")
def api_ensure_world(target_id: str, body: EnsureWorldBody | None = None) -> dict:
    scenario_id = body.scenario_id if body else None
    world = _world_or_404(target_id, scenario_id)
    return WORLDS.snapshot(world)


@app.post("/api/worlds/{target_id}/act")
def api_act(target_id: str, body: ActBody) -> dict:
    _world_or_404(target_id)
    try:
        return WORLDS.act(target_id, body.action, body.args)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/worlds/{target_id}/chat")
def api_chat(target_id: str, body: ChatBody) -> dict:
    _world_or_404(target_id)
    try:
        reply = WORLDS.chat(target_id, body.message)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"reply": reply}


@app.post("/api/worlds/{target_id}/chat/reset")
def api_reset_chat(target_id: str) -> dict:
    try:
        world = WORLDS.clear_chat(target_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return WORLDS.snapshot(world)


@app.get("/api/worlds/{target_id}/trace")
def api_trace(target_id: str) -> list[dict]:
    world = _world_or_404(target_id)
    return [asdict(e) for e in world.tracer.events]


@app.get("/api/worlds/{target_id}/sim")
def api_sim(target_id: str) -> dict:
    world = _world_or_404(target_id)
    if world.target.sim_state is None:
        return {}
    return world.target.sim_state(world.ctx)


@app.get("/api/worlds/{target_id}/sink")
def api_sink(target_id: str, channel: str | None = Query(default=None)) -> list[dict]:
    _world_or_404(target_id)
    return [asdict(e) for e in SINKS.received(channel=channel, session_id=target_id)]


@app.get("/api/worlds/{target_id}/observations")
def api_observations(target_id: str) -> dict:
    world = _world_or_404(target_id)
    items = [_evaluate_scenario(world, s) for s in load_scenarios() if s.target == target_id]
    return {"target_id": target_id, "observations": items}


@app.post("/api/worlds/{target_id}/defenses")
def api_set_defenses(target_id: str, body: DefensesBody) -> dict:
    try:
        world = WORLDS.set_defenses(target_id, body.enabled_defenses)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return WORLDS.snapshot(world)


@app.post("/api/worlds/{target_id}/reset")
def api_reset_world(target_id: str, body: EnsureWorldBody | None = None) -> dict:
    scenario_id = body.scenario_id if body else None
    try:
        world = WORLDS.reset(target_id, scenario_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # 通关进度是学习历史，不随世界重置清除；checklist 显示的是当前世界的实时判定。
    return WORLDS.snapshot(world)


@app.get("/api/worlds/{target_id}/report")
def api_report(target_id: str, scenario_id: str) -> PlainTextResponse:
    from ..core.report import generate_report

    world = _world_or_404(target_id)
    scenario = get_scenario(scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail=f"unknown scenario {scenario_id}")
    sink_events = SINKS.received(session_id=target_id)
    return PlainTextResponse(
        generate_report(scenario, target_id, world.tracer.events, sink_events),
        media_type="text/markdown; charset=utf-8",
    )


# Starlette StaticFiles(html=True) does NOT serve index.html for missing paths
# (only directory indexes + 404.html), so deep links like /range/mail_agent
# would 404 on refresh. Mount hashed assets, then SPA-fallback everything else.
_SPA_SKIP = ("api/", "sink/", "internal/", "mcp-remote/", "sites/")

if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/")
    def spa_index() -> FileResponse:
        return FileResponse(DIST_DIR / "index.html")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith(_SPA_SKIP):
            raise HTTPException(status_code=404, detail="not found")
        candidate = (DIST_DIR / full_path).resolve()
        dist_root = DIST_DIR.resolve()
        try:
            candidate.relative_to(dist_root)
        except ValueError:
            raise HTTPException(status_code=404, detail="not found") from None
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
else:
    logger.info("frontend/dist not found. Build with: cd frontend && npm run build")

    @app.get("/")
    def no_frontend() -> PlainTextResponse:
        return PlainTextResponse("请先构建前端：cd frontend && npm run build\n", status_code=503)

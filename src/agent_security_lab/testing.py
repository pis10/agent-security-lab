"""Dev/test helpers: boot a live sink server and replay scripted attacks."""
from __future__ import annotations

import contextlib
import dataclasses
import socket
import threading
import time

import httpx

from .config import Config, load_config
from .core.agent import Agent
from .core.llm import MockLLM
from .core.sinks import SINKS, build_sink_router
from .core.tools import ToolContext, ToolRegistry
from .core.trace import Tracer
from .targets.base import Target


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def live_sinks(config: Config):
    """Run the sink/internal FastAPI routes on config.port for the block's duration.

    Also serves data/seeds/browser_agent/sites at /sites/ so browser_agent's
    visit_page works over real HTTP in tests (same mount as the web app).
    """
    import uvicorn
    from fastapi import FastAPI
    from fastapi.staticfiles import StaticFiles

    from .config import PROJECT_ROOT

    app = FastAPI()
    app.include_router(build_sink_router())
    sites_dir = PROJECT_ROOT / "data" / "seeds" / "browser_agent" / "sites"
    if sites_dir.exists():
        app.mount("/sites", StaticFiles(directory=sites_dir), name="sites")
    SINKS.reset()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=config.port, log_level="error"))
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            httpx.get(f"http://127.0.0.1:{config.port}/internal/metadata", timeout=0.5)
            break
        except httpx.TransportError:
            time.sleep(0.05)
    else:
        raise RuntimeError("sink server did not start")
    SINKS.reset()  # drop the readiness probe
    try:
        yield
    finally:
        server.should_exit = True
        thread.join(timeout=5)


def test_config() -> Config:
    """Config with an ephemeral port for tests/self-checks."""
    return dataclasses.replace(load_config(), host="127.0.0.1", port=free_port())


def run_mock_attack(
    target: Target,
    config: Config,
    user_message: str = "请开始处理任务。",
    tracer: Tracer | None = None,
    scenario_id: str | None = None,
    defenses: set[str] | None = None,
) -> tuple[Tracer, str]:
    """Replay a target's scripted attack chain through the real agent loop."""
    tracer = tracer or Tracer(session_id=f"smoke-{target.id}")
    ctx = ToolContext(session_id=tracer.session_id, tracer=tracer, config=config)
    ctx.state["defenses"] = defenses or set()
    ctx.state["force_seed"] = True
    target.seed(ctx)
    target.on_session_start(ctx)
    try:
        agent = Agent(
            MockLLM(target.build_mock_script(ctx, scenario_id)),
            ToolRegistry(target.build_tools(ctx)),
            target.system_prompt,
            tracer,
        )
        output = agent.run(user_message, ctx)
    finally:
        target.on_session_end(ctx)
    return tracer, output

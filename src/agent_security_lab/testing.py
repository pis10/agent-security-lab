"""Dev/test helpers: boot a live sink server for redteam / local checks."""
from __future__ import annotations

import contextlib
import dataclasses
import socket
import threading
import time

import httpx

from .config import Config, load_config
from .core.sinks import SINKS, build_sink_router


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@contextlib.contextmanager
def live_sinks(config: Config):
    """Run the sink/internal FastAPI routes on config.port for the block's duration.

    Also serves data/seeds/browser_agent/sites at /sites/ so browser_agent's
    visit_page works over real HTTP (same mount as the web app).
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

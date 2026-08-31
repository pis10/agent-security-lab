"""Persistent product worlds for the range UI.

One directory per target: data/runtime/worlds/<target_id>/. Survives process
restart. Reset deletes that directory and reseeds from data/seeds/.
"""
from __future__ import annotations

import json
import logging
import shutil
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

from ..config import Config
from ..core.agent import Agent
from ..core.db import WORLDS_DIR
from ..core.llm import MockLLM, build_llm
from ..core.sinks import SINKS
from ..core.tools import ToolContext, ToolRegistry
from ..core.trace import Tracer
from ..targets import get_target
from ..targets.base import Target

logger = logging.getLogger("asl.worlds")


@dataclass
class World:
    target_id: str
    target: Target
    ctx: ToolContext
    agent: Agent
    tracer: Tracer
    scenario_id: str | None = None
    created: float = field(default_factory=time.time)
    messages: list[dict] = field(default_factory=list)

    @property
    def dir(self) -> Path:
        return Path(self.ctx.state["world_dir"])


def _meta_path(root: Path) -> Path:
    return root / "meta.json"


def _chat_path(root: Path) -> Path:
    return root / "chat.json"


def _count_jsonl(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def disk_snapshot(target_id: str) -> dict | None:
    root = WORLDS_DIR / target_id
    if not root.is_dir():
        return None
    meta = {"created": root.stat().st_mtime, "defenses": [], "scenario_id": None}
    if _meta_path(root).exists():
        meta.update(json.loads(_meta_path(root).read_text(encoding="utf-8")))
    messages = []
    if _chat_path(root).exists():
        messages = json.loads(_chat_path(root).read_text(encoding="utf-8"))
    return {
        "target_id": target_id,
        "scenario_id": meta.get("scenario_id"),
        "created": meta.get("created") or root.stat().st_mtime,
        "enabled_defenses": list(meta.get("defenses") or []),
        "event_count": _count_jsonl(root / "trace.jsonl"),
        "sink_count": _count_jsonl(root / "sinks.jsonl"),
        "messages": messages,
    }


def list_disk_worlds() -> list[dict]:
    if not WORLDS_DIR.exists():
        return []
    items = []
    for child in sorted(WORLDS_DIR.iterdir()):
        if child.is_dir():
            snap = disk_snapshot(child.name)
            if snap:
                items.append(snap)
    return items


class WorldManager:
    def __init__(self, config: Config):
        self._config = config
        self._worlds: dict[str, World] = {}
        self._lock = threading.Lock()

    def list(self) -> list[dict]:
        with self._lock:
            live = {w.target_id: w for w in self._worlds.values()}
        out = []
        seen = set()
        for snap in list_disk_worlds():
            seen.add(snap["target_id"])
            w = live.get(snap["target_id"])
            if w:
                snap["enabled_defenses"] = sorted(w.ctx.state.get("defenses", set()))
                snap["scenario_id"] = w.scenario_id
                snap["event_count"] = len(w.tracer.events)
                snap["sink_count"] = len(SINKS.received(session_id=w.target_id))
                snap["messages"] = list(w.messages)
            out.append(snap)
        for tid, w in live.items():
            if tid not in seen:
                out.append(self._snapshot(w))
        return out

    def ensure(self, target_id: str, scenario_id: str | None = None) -> World:
        if not self._config.llm_available:
            raise RuntimeError(
                "未配置 LLM Key:请复制 .env.example 为 .env 并填入 ASL_LLM_API_KEY,"
                "或用 ASL_USE_MOCK_LLM=1 启动离线 mock 模式。"
            )
        with self._lock:
            world = self._worlds.get(target_id)
            if world is None:
                world = self._hydrate(target_id, scenario_id)
                self._worlds[target_id] = world
            elif scenario_id is not None and scenario_id != world.scenario_id:
                world.scenario_id = scenario_id
                self._rebuild_agent(world)
                self._save_meta(world)
            return world

    def set_defenses(self, target_id: str, defenses: list[str]) -> World:
        world = self.ensure(target_id)
        valid = {d.id for d in world.target.defenses}
        unknown = set(defenses) - valid
        if unknown:
            raise ValueError(f"unknown defenses: {sorted(unknown)}")
        with self._lock:
            world.ctx.state["defenses"] = set(defenses)
            self._save_meta(world)
        logger.info("world %s defenses=%s", target_id, sorted(defenses))
        return world

    def reset(self, target_id: str, scenario_id: str | None = None) -> World:
        with self._lock:
            world = self._worlds.pop(target_id, None)
            if world:
                world.target.on_session_end(world.ctx)
                world.tracer.close()
            SINKS.purge_session(target_id)
            SINKS.detach_log(target_id)
            root = WORLDS_DIR / target_id
            if root.exists():
                shutil.rmtree(root)
        logger.info("world %s reset", target_id)
        return self.ensure(target_id, scenario_id)

    def chat(self, target_id: str, message: str) -> str:
        world = self.ensure(target_id)
        world.messages.append({"role": "user", "content": message})
        reply = world.agent.run(message, world.ctx)
        world.messages.append({"role": "assistant", "content": reply})
        self._save_chat(world)
        return reply

    def snapshot(self, world: World) -> dict:
        return self._snapshot(world)

    def shutdown(self) -> None:
        with self._lock:
            worlds = list(self._worlds.values())
            self._worlds.clear()
        for world in worlds:
            try:
                world.target.on_session_end(world.ctx)
                world.tracer.close()
            except Exception:
                logger.warning("world %s shutdown failed", world.target_id, exc_info=True)

    def _hydrate(self, target_id: str, scenario_id: str | None) -> World:
        target = get_target(target_id)
        root = WORLDS_DIR / target_id
        root.mkdir(parents=True, exist_ok=True)
        meta = {"created": time.time(), "defenses": [], "scenario_id": scenario_id}
        if _meta_path(root).exists():
            meta.update(json.loads(_meta_path(root).read_text(encoding="utf-8")))
        if scenario_id is not None:
            meta["scenario_id"] = scenario_id
        messages = []
        if _chat_path(root).exists():
            messages = json.loads(_chat_path(root).read_text(encoding="utf-8"))

        tracer = Tracer(session_id=target_id, path=root / "trace.jsonl")
        ctx = ToolContext(session_id=target_id, tracer=tracer, config=self._config)
        ctx.state["world_dir"] = str(root)
        ctx.state["defenses"] = set(meta.get("defenses") or [])
        target.seed(ctx)
        SINKS.attach_log(target_id, root / "sinks.jsonl")
        target.on_session_start(ctx)
        world = World(
            target_id=target_id,
            target=target,
            ctx=ctx,
            agent=self._make_agent(target, ctx, tracer, meta.get("scenario_id")),
            tracer=tracer,
            scenario_id=meta.get("scenario_id"),
            created=float(meta.get("created") or time.time()),
            messages=messages,
        )
        self._save_meta(world)
        logger.info("world %s ready (defenses=%s)", target_id, sorted(ctx.state["defenses"]))
        return world

    def _make_agent(self, target: Target, ctx: ToolContext, tracer: Tracer, scenario_id: str | None) -> Agent:
        if self._config.use_mock_llm:
            llm = MockLLM(target.build_mock_script(ctx, scenario_id))
        else:
            llm = build_llm(self._config)
        return Agent(llm, ToolRegistry(target.build_tools(ctx)), target.system_prompt, tracer)

    def _rebuild_agent(self, world: World) -> None:
        world.agent = self._make_agent(world.target, world.ctx, world.tracer, world.scenario_id)

    def _save_meta(self, world: World) -> None:
        payload = {
            "target_id": world.target_id,
            "created": world.created,
            "defenses": sorted(world.ctx.state.get("defenses", set())),
            "scenario_id": world.scenario_id,
        }
        _meta_path(world.dir).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _save_chat(self, world: World) -> None:
        _chat_path(world.dir).write_text(json.dumps(world.messages, ensure_ascii=False, indent=2), encoding="utf-8")

    def _snapshot(self, world: World) -> dict:
        return {
            "target_id": world.target_id,
            "scenario_id": world.scenario_id,
            "created": world.created,
            "enabled_defenses": sorted(world.ctx.state.get("defenses", set())),
            "event_count": len(world.tracer.events),
            "sink_count": len(SINKS.received(session_id=world.target_id)),
            "messages": list(world.messages),
        }

"""Local exfil inbox (外发箱) and fake intranet endpoints.

Sinks record what a real attack would have sent out. Internal routes stand in
for intranet / cloud metadata. Bind 127.0.0.1 only; payloads are TEST_* dummy.
"""
from __future__ import annotations

import json
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from fastapi import APIRouter, Request


@dataclass
class SinkEvent:
    ts: float
    session_id: str
    channel: str  # email | http | internal
    payload: dict


@dataclass
class SinkState:
    """In-memory record of everything that hit the sink inbox.

    Range worlds attach a JSONL path so loot survives process restart.
    """
    events: list[SinkEvent] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _logs: dict[str, Path] = field(default_factory=dict)

    def attach_log(self, session_id: str, path: Path) -> None:
        self._logs[session_id] = path
        if not path.exists():
            return
        with self._lock:
            if any(e.session_id == session_id for e in self.events):
                return
            for line in path.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                d = json.loads(line)
                self.events.append(
                    SinkEvent(
                        ts=d["ts"],
                        session_id=d["session_id"],
                        channel=d["channel"],
                        payload=d.get("payload") or {},
                    )
                )

    def detach_log(self, session_id: str) -> None:
        self._logs.pop(session_id, None)

    def add(self, session_id: str, channel: str, payload: dict) -> SinkEvent:
        ev = SinkEvent(ts=time.time(), session_id=session_id, channel=channel, payload=payload)
        with self._lock:
            self.events.append(ev)
            path = self._logs.get(session_id)
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(asdict(ev), ensure_ascii=False) + "\n")
        return ev

    def received(self, channel: str | None = None, session_id: str | None = None) -> list[SinkEvent]:
        with self._lock:
            events = list(self.events)
        if channel is not None:
            events = [e for e in events if e.channel == channel]
        if session_id is not None:
            events = [e for e in events if e.session_id == session_id]
        return events

    def reset(self) -> None:
        with self._lock:
            self.events.clear()

    def purge_session(self, session_id: str) -> None:
        with self._lock:
            self.events[:] = [e for e in self.events if e.session_id != session_id]


SINKS = SinkState()


def _session_of(request: Request) -> str:
    return request.headers.get("X-ASL-Session", "global")


def build_sink_router(state: SinkState = SINKS) -> APIRouter:
    router = APIRouter()

    @router.post("/sink/email")
    async def sink_email(request: Request) -> dict:
        body = await request.json()
        state.add(_session_of(request), "email", body)
        return {"ok": True, "note": "外发箱已收下（未真实发送）"}

    @router.post("/sink/http")
    async def sink_http(request: Request) -> dict:
        body = await request.json()
        state.add(_session_of(request), "http", body)
        return {"ok": True, "note": "外发箱已记录本次请求"}

    @router.get("/internal/records")
    async def internal_records(request: Request) -> dict:
        state.add(_session_of(request), "internal", {"endpoint": "/internal/records"})
        return {
            "rows": [
                {"id": 1, "name": "dummy-user", "ssn": "TEST_SSN_000-00-0000"},
                {"id": 2, "name": "dummy-admin", "api_key": "PRD-RECORD-9F3K"},
            ]
        }

    @router.get("/internal/metadata")
    async def internal_metadata(request: Request) -> dict:
        payload = {
            "endpoint": "/internal/metadata",
            "instance": "ops-test",
            "iam_token": "ASIAIOSFODNN7EXAMPLE",
        }
        state.add(_session_of(request), "internal", payload)
        return payload

    return router

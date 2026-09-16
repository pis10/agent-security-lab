"""Trace recording: every security-relevant event of a session, JSONL-persisted.

The trace is the ground truth for flag assertions — flags fire on observed
side effects, never on what the model merely said.
"""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass
class TraceEvent:
    ts: float
    session_id: str
    kind: str
    data: dict


class Tracer:
    def __init__(
        self,
        session_id: str | None = None,
        trace_dir: Path | None = None,
        path: Path | None = None,
    ):
        self.session_id = session_id or uuid.uuid4().hex[:12]
        self._events: list[TraceEvent] = []
        self._fh = None
        if path is not None:
            self._path = path
        elif trace_dir is not None:
            self._path = trace_dir / f"{self.session_id}.jsonl"
        else:
            self._path = None
        if self._path is not None:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            if self._path.exists():
                for line in self._path.read_text(encoding="utf-8").splitlines():
                    if not line.strip():
                        continue
                    d = json.loads(line)
                    self._events.append(
                        TraceEvent(
                            ts=d["ts"],
                            session_id=d["session_id"],
                            kind=d["kind"],
                            data=d.get("data") or {},
                        )
                    )
            self._fh = open(self._path, "a", encoding="utf-8")

    def record(self, kind: str, **data) -> TraceEvent:
        ev = TraceEvent(ts=time.time(), session_id=self.session_id, kind=kind, data=data)
        self._events.append(ev)
        if self._fh:
            self._fh.write(json.dumps(asdict(ev), ensure_ascii=False) + "\n")
            self._fh.flush()
        return ev

    @property
    def events(self) -> list[TraceEvent]:
        return list(self._events)

    def of_kind(self, kind: str) -> list[TraceEvent]:
        return [e for e in self._events if e.kind == kind]

    def tool_call_events(self, name: str | None = None) -> list[TraceEvent]:
        events = self.of_kind("tool_call")
        if name is not None:
            events = [e for e in events if e.data.get("name") == name]
        return events

    def close(self) -> None:
        if self._fh:
            self._fh.close()
            self._fh = None

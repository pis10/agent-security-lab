"""SQLite data layer (stdlib only).

Two distinct uses, by design:
- Global progress DB (data/runtime/progress.db): flag captures across restarts.
- Per-session target DBs (data/runtime/<session>/target.db): realistic business
  data for targets — enables real SQL and, later, SQLi scenarios.

Traces stay JSONL and sinks stay in-memory: logs are append-only, loot is volatile.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

from ..config import PROJECT_ROOT

RUNTIME_DIR = PROJECT_ROOT / "data" / "runtime"


def connect(path: Path) -> sqlite3.Connection:
    """Open (creating parents) a sqlite DB with row access by column name.

    A fresh connection per call keeps FastAPI's threadpool safe.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


class ProgressDB:
    """Flag captures: which scenarios have ever been solved."""

    def __init__(self, path: Path | None = None):
        self._path = path or RUNTIME_DIR / "progress.db"
        self._ensure_schema()

    def _ensure_schema(self) -> None:
        """Idempotent — also recovers if the db file was removed mid-run."""
        with connect(self._path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS captures (
                    scenario_id TEXT PRIMARY KEY,
                    session_id  TEXT NOT NULL,
                    defenses    TEXT NOT NULL DEFAULT '[]',
                    captured_at REAL NOT NULL
                )
                """
            )

    def record_capture(self, scenario_id: str, session_id: str, defenses: list[str]) -> None:
        self._ensure_schema()
        with connect(self._path) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO captures (scenario_id, session_id, defenses, captured_at)"
                " VALUES (?, ?, ?, ?)",
                (scenario_id, session_id, json.dumps(defenses), time.time()),
            )

    def captured(self) -> dict[str, dict]:
        self._ensure_schema()
        with connect(self._path) as conn:
            rows = conn.execute("SELECT * FROM captures ORDER BY captured_at").fetchall()
        return {
            r["scenario_id"]: {
                "session_id": r["session_id"],
                "defenses": json.loads(r["defenses"]),
                "captured_at": r["captured_at"],
            }
            for r in rows
        }

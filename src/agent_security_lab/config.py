"""Configuration loading: .env + environment variables."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = PACKAGE_ROOT.parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader (no dependency). Does not override real env vars."""
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass(frozen=True)
class Config:
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    use_mock_llm: bool
    host: str
    port: int
    trace_dir: Path

    @property
    def llm_available(self) -> bool:
        return self.use_mock_llm or bool(self.llm_api_key)


def load_config() -> Config:
    _load_dotenv(PROJECT_ROOT / ".env")
    return Config(
        llm_base_url=os.environ.get("ASL_LLM_BASE_URL", "https://api.kimi.com/coding/v1"),
        llm_api_key=os.environ.get("ASL_LLM_API_KEY", ""),
        llm_model=os.environ.get("ASL_LLM_MODEL", "kimi-for-coding"),
        use_mock_llm=os.environ.get("ASL_USE_MOCK_LLM", "0") == "1",
        host=os.environ.get("ASL_HOST", "127.0.0.1"),
        port=int(os.environ.get("ASL_PORT", "8600")),
        trace_dir=PROJECT_ROOT / "traces",
    )

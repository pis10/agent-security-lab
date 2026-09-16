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
    llm_thinking: str
    llm_temperature: float
    host: str
    port: int
    trace_dir: Path

    @property
    def llm_available(self) -> bool:
        return bool(self.llm_api_key)


def load_config() -> Config:
    _load_dotenv(PROJECT_ROOT / ".env")
    return Config(
        llm_base_url=os.environ.get("ASL_LLM_BASE_URL", "https://open.bigmodel.cn/api/coding/paas/v4"),
        llm_api_key=os.environ.get("ASL_LLM_API_KEY", ""),
        llm_model=os.environ.get("ASL_LLM_MODEL", "glm-5.3-flash"),
        # GLM 思考模式：disabled=快且直接（靶场默认）；enabled=带推理（更慢、更谨慎）。
        # 留空则不发送该参数（用于不认识 thinking 字段的端点）。
        llm_thinking=os.environ.get("ASL_LLM_THINKING", "disabled"),
        # 低温采样：目标 Agent 对同类请求的行为稳定，靶场判定不随采样方差抖动。
        llm_temperature=float(os.environ.get("ASL_LLM_TEMPERATURE", "0.3")),
        host=os.environ.get("ASL_HOST", "127.0.0.1"),
        port=int(os.environ.get("ASL_PORT", "8600")),
        trace_dir=PROJECT_ROOT / "traces",
    )

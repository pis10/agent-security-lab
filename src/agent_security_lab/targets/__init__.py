"""Target registry. Lazy imports keep the package importable while individual
targets are under construction or broken."""
from __future__ import annotations

import importlib

from .base import Target

_TARGET_IDS = ["support_bot", "devops_assistant", "mail_agent", "mcp_playground", "browser_agent"]


def get_target(target_id: str) -> Target:
    if target_id not in _TARGET_IDS:
        raise KeyError(f"unknown target {target_id!r}; available: {_TARGET_IDS}")
    return importlib.import_module(f".{target_id}", __package__).TARGET


def list_targets() -> list[Target]:
    targets = []
    for tid in _TARGET_IDS:
        try:
            targets.append(get_target(tid))
        except Exception:
            continue  # target not built yet / broken — hide from listings
    return targets


__all__ = ["Target", "get_target", "list_targets"]

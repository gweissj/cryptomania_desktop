from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Dict

from .config import DEFAULT_STATE_PATH


@dataclass
class DesktopState:
    access_token: str | None = None
    last_command_id: int | None = None
    last_polled_at: str | None = None


class DesktopStateStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path) if path else DEFAULT_STATE_PATH
        self._state = self._load()

    @property
    def state(self) -> DesktopState:
        return self._state

    def _load(self) -> DesktopState:
        if not self.path.exists():
            return DesktopState()
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return DesktopState()
        return DesktopState(
            access_token=data.get("access_token"),
            last_command_id=data.get("last_command_id"),
            last_polled_at=data.get("last_polled_at"),
        )

    def save(self) -> None:
        payload: Dict[str, Any] = asdict(self._state)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def clear_token(self) -> None:
        self._state.access_token = None
        self.save()

    def set_token(self, token: str) -> None:
        self._state.access_token = token
        self.save()


__all__ = ["DesktopState", "DesktopStateStore"]

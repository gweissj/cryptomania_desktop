from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Dict

ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = ROOT_DIR / "config.json"
DEFAULT_STATE_PATH = ROOT_DIR / "device_state.json"


@dataclass
class AppConfig:
    api_base_url: str = "http://127.0.0.1:8000"
    target_device: str = "desktop"
    device_id: str = "desktop-cli"
    poll_interval_seconds: int = 5
    auto_confirm_sales: bool = False
    verify_ssl: bool = False

    def normalized_base_url(self) -> str:
        base = self.api_base_url.strip().rstrip("/")
        if not base:
            raise ValueError("API base URL is empty")
        return base

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def _read_json_config(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"Failed to parse config file {path}: {exc}") from exc


def _bool_from_env(value: str | None) -> bool | None:
    if value is None:
        return None
    value = value.strip().lower()
    if value in {"1", "true", "yes", "y"}:
        return True
    if value in {"0", "false", "no", "n"}:
        return False
    return None


def load_config(path: Path | None = None) -> AppConfig:
    config_path = path or DEFAULT_CONFIG_PATH
    raw = _read_json_config(config_path)
    data: Dict[str, Any] = {
        "api_base_url": raw.get("api_base_url", AppConfig.api_base_url),
        "target_device": raw.get("target_device", AppConfig.target_device),
        "device_id": raw.get("device_id", AppConfig.device_id),
        "poll_interval_seconds": int(raw.get("poll_interval_seconds", AppConfig.poll_interval_seconds)),
        "auto_confirm_sales": bool(raw.get("auto_confirm_sales", AppConfig.auto_confirm_sales)),
        "verify_ssl": bool(raw.get("verify_ssl", AppConfig.verify_ssl)),
    }

    env_overrides = {
        "api_base_url": os.getenv("KURSACH_API_BASE_URL"),
        "target_device": os.getenv("KURSACH_TARGET_DEVICE"),
        "device_id": os.getenv("KURSACH_DEVICE_ID"),
        "poll_interval_seconds": os.getenv("KURSACH_POLL_INTERVAL"),
        "auto_confirm_sales": os.getenv("KURSACH_AUTO_CONFIRM"),
        "verify_ssl": os.getenv("KURSACH_VERIFY_SSL"),
    }

    if env_overrides["api_base_url"]:
        data["api_base_url"] = env_overrides["api_base_url"].strip()
    if env_overrides["target_device"]:
        data["target_device"] = env_overrides["target_device"].strip()
    if env_overrides["device_id"]:
        data["device_id"] = env_overrides["device_id"].strip()
    if env_overrides["poll_interval_seconds"]:
        data["poll_interval_seconds"] = int(env_overrides["poll_interval_seconds"])

    auto_confirm_env = _bool_from_env(env_overrides["auto_confirm_sales"])
    if auto_confirm_env is not None:
        data["auto_confirm_sales"] = auto_confirm_env

    verify_ssl_env = _bool_from_env(env_overrides["verify_ssl"])
    if verify_ssl_env is not None:
        data["verify_ssl"] = verify_ssl_env

    config = AppConfig(**data)
    return config


__all__ = [
    "AppConfig",
    "DEFAULT_CONFIG_PATH",
    "DEFAULT_STATE_PATH",
    "ROOT_DIR",
    "load_config",
]

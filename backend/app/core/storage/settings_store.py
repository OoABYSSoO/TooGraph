from __future__ import annotations

from typing import Any

from app.core.storage.database import SETTINGS_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


APP_SETTINGS_PATH = SETTINGS_DATA_DIR / "app_settings.json"


def load_app_settings() -> dict[str, Any]:
    SETTINGS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    return read_json_file(APP_SETTINGS_PATH, default={}) or {}


def save_app_settings(payload: dict[str, Any]) -> dict[str, Any]:
    SETTINGS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    write_json_file(APP_SETTINGS_PATH, payload)
    return load_app_settings()

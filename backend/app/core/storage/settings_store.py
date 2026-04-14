from __future__ import annotations

import sqlite3
from typing import Any

from app.core.storage.database import SETTINGS_DATA_DIR, get_connection, row_payload
from app.core.storage.json_file_utils import read_json_file, write_json_file


APP_SETTINGS_PATH = SETTINGS_DATA_DIR / "app_settings.json"
_SETTINGS_MIGRATED = False


def load_app_settings() -> dict[str, Any]:
    _initialize_settings_storage()
    return read_json_file(APP_SETTINGS_PATH, default={}) or {}


def save_app_settings(payload: dict[str, Any]) -> dict[str, Any]:
    _initialize_settings_storage()
    write_json_file(APP_SETTINGS_PATH, payload)
    return load_app_settings()


def _initialize_settings_storage() -> None:
    global _SETTINGS_MIGRATED
    SETTINGS_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if _SETTINGS_MIGRATED:
        return
    if not APP_SETTINGS_PATH.exists():
        _migrate_settings_from_database()
    _SETTINGS_MIGRATED = True


def _migrate_settings_from_database() -> None:
    try:
        with get_connection() as connection:
            row = connection.execute(
                "SELECT payload_json FROM app_settings WHERE setting_key = ?",
                ("global",),
            ).fetchone()
    except sqlite3.OperationalError:
        return
    payload = row_payload(row) or {}
    if payload:
        write_json_file(APP_SETTINGS_PATH, payload)

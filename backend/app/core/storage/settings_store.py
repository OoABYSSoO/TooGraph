from __future__ import annotations

import json
from typing import Any

from app.core.storage.database import get_connection, row_payload


GLOBAL_SETTINGS_KEY = "global"


def load_app_settings() -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT payload_json FROM app_settings WHERE setting_key = ?",
            (GLOBAL_SETTINGS_KEY,),
        ).fetchone()
    return row_payload(row) or {}


def save_app_settings(payload: dict[str, Any]) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO app_settings (setting_key, payload_json, created_at, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(setting_key) DO UPDATE SET
                payload_json = excluded.payload_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                GLOBAL_SETTINGS_KEY,
                json.dumps(payload, ensure_ascii=False),
            ),
        )
        connection.commit()
    return load_app_settings()

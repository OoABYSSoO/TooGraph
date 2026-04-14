from __future__ import annotations

import sqlite3
from typing import Any

from app.core.storage.database import RUN_DATA_DIR, get_connection, row_payload
from app.core.storage.json_file_utils import read_json_file, write_json_file


_RUN_STORAGE_MIGRATED = False


def save_run(run_state: dict[str, Any]) -> None:
    _initialize_run_storage()
    write_json_file(_run_path(run_state["run_id"]), run_state)


def load_run(run_id: str) -> dict[str, Any]:
    _initialize_run_storage()
    payload = read_json_file(_run_path(run_id), default=None)
    if payload is None:
        raise FileNotFoundError(f"Run '{run_id}' does not exist.")
    return payload


def list_runs() -> list[dict[str, Any]]:
    _initialize_run_storage()
    items: list[dict[str, Any]] = []
    for path in sorted(RUN_DATA_DIR.glob("*.json")):
        payload = read_json_file(path, default=None)
        if payload is not None:
            items.append(payload)
    items.sort(key=lambda item: (str(item.get("started_at", "")), str(item.get("run_id", ""))), reverse=True)
    return items


def _initialize_run_storage() -> None:
    global _RUN_STORAGE_MIGRATED
    RUN_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if _RUN_STORAGE_MIGRATED:
        return
    _migrate_runs_from_database()
    _RUN_STORAGE_MIGRATED = True


def _migrate_runs_from_database() -> None:
    try:
        with get_connection() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM runs ORDER BY started_at DESC, run_id DESC"
            ).fetchall()
    except sqlite3.OperationalError:
        return

    for row in rows:
        payload = row_payload(row)
        if payload is None:
            continue
        run_id = str(payload.get("run_id") or "").strip()
        if not run_id:
            continue
        path = _run_path(run_id)
        if path.exists():
            continue
        write_json_file(path, payload)


def _run_path(run_id: str):
    return RUN_DATA_DIR / f"{run_id}.json"

from __future__ import annotations

from typing import Any

from app.core.storage.database import RUN_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


def save_run(run_state: dict[str, Any]) -> None:
    RUN_DATA_DIR.mkdir(parents=True, exist_ok=True)
    write_json_file(_run_path(run_state["run_id"]), run_state)


def load_run(run_id: str) -> dict[str, Any]:
    RUN_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(_run_path(run_id), default=None)
    if payload is None:
        raise FileNotFoundError(f"Run '{run_id}' does not exist.")
    return payload


def list_runs() -> list[dict[str, Any]]:
    RUN_DATA_DIR.mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    for path in sorted(RUN_DATA_DIR.glob("*.json")):
        payload = read_json_file(path, default=None)
        if payload is not None:
            items.append(payload)
    items.sort(key=lambda item: (str(item.get("started_at", "")), str(item.get("run_id", ""))), reverse=True)
    return items


def _run_path(run_id: str):
    return RUN_DATA_DIR / f"{run_id}.json"

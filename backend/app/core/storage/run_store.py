from __future__ import annotations

import json
from pathlib import Path
from typing import Any


BASE_DIR = Path(__file__).resolve().parents[2]
RUN_DATA_DIR = BASE_DIR / "data" / "runs"


def save_run(run_state: dict[str, Any]) -> None:
    RUN_DATA_DIR.mkdir(parents=True, exist_ok=True)
    run_id = run_state["run_id"]
    run_path = RUN_DATA_DIR / f"{run_id}.json"
    run_path.write_text(json.dumps(run_state, ensure_ascii=False, indent=2), encoding="utf-8")


def load_run(run_id: str) -> dict[str, Any]:
    run_path = RUN_DATA_DIR / f"{run_id}.json"
    if not run_path.exists():
        raise FileNotFoundError(f"Run '{run_id}' does not exist.")
    return json.loads(run_path.read_text(encoding="utf-8"))


def list_runs() -> list[dict[str, Any]]:
    RUN_DATA_DIR.mkdir(parents=True, exist_ok=True)
    runs: list[dict[str, Any]] = []
    for path in sorted(RUN_DATA_DIR.glob("run_*.json"), reverse=True):
        runs.append(json.loads(path.read_text(encoding="utf-8")))
    return runs


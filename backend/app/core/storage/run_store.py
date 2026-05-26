from __future__ import annotations

from typing import Any

from app.core.storage.graph_run_db_store import (
    build_run_tree_state,
    list_child_run_states,
    list_run_states,
    load_run_state,
    save_run_state,
)


def save_run(run_state: dict[str, Any]) -> None:
    save_run_state(run_state)


def load_run(run_id: str) -> dict[str, Any]:
    return load_run_state(run_id)


def list_runs() -> list[dict[str, Any]]:
    return list_run_states()


def list_child_runs(parent_run_id: str) -> list[dict[str, Any]]:
    return list_child_run_states(parent_run_id)


def build_run_tree(run_id: str) -> dict[str, Any]:
    return build_run_tree_state(run_id)

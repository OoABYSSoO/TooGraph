from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.core.runtime.node_execution_records import (
    INTERRUPTED_RUN_MESSAGE,
    duration_between_iso_ms,
    find_latest_running_execution,
)
from app.core.runtime.state import ensure_checkpoint_metadata, ensure_run_lifecycle, utc_now_iso
from app.core.storage.run_store import list_runs, save_run


ACTIVE_RUN_STATUSES = {"queued", "running", "resuming"}


def mark_interrupted_active_runs(
    *,
    list_runs_func: Callable[[], list[dict[str, Any]]] | None = None,
    save_run_func: Callable[[dict[str, Any]], None] | None = None,
    now_func: Callable[[], str] | None = None,
) -> int:
    load_runs = list_runs_func or list_runs
    persist_run = save_run_func or save_run
    resolve_now = now_func or utc_now_iso
    interrupted_count = 0

    for run in load_runs():
        if str(run.get("status") or "") not in ACTIVE_RUN_STATUSES:
            continue

        now = resolve_now()
        current_node_id = str(run.get("current_node_id") or "").strip()
        run["status"] = "failed"
        run["completed_at"] = now
        ensure_run_lifecycle(run)["updated_at"] = now
        ensure_checkpoint_metadata(run)
        _append_unique_message(run, "errors", INTERRUPTED_RUN_MESSAGE)
        _append_unique_message(run, "warnings", INTERRUPTED_RUN_MESSAGE)
        _mark_current_node_failed(run, current_node_id)
        _append_interrupted_node_execution(run, current_node_id, now)
        persist_run(run)
        interrupted_count += 1

    return interrupted_count


def _append_unique_message(run: dict[str, Any], key: str, message: str) -> None:
    values = run.setdefault(key, [])
    if not isinstance(values, list):
        run[key] = [message]
        return
    if message not in values:
        values.append(message)


def _mark_current_node_failed(run: dict[str, Any], current_node_id: str) -> None:
    if not current_node_id:
        return
    node_status_map = run.setdefault("node_status_map", {})
    if isinstance(node_status_map, dict):
        node_status_map[current_node_id] = "failed"


def _append_interrupted_node_execution(run: dict[str, Any], current_node_id: str, now: str) -> None:
    if not current_node_id:
        return

    running_execution = find_latest_running_execution(run, current_node_id)
    if running_execution is not None:
        running_execution["status"] = "failed"
        running_execution["finished_at"] = now
        running_execution["duration_ms"] = duration_between_iso_ms(running_execution.get("started_at"), now)
        running_execution["errors"] = [
            *_without_message(running_execution.get("errors"), INTERRUPTED_RUN_MESSAGE),
            INTERRUPTED_RUN_MESSAGE,
        ]
        return

    node_executions = run.setdefault("node_executions", [])
    if not isinstance(node_executions, list):
        run["node_executions"] = []
        node_executions = run["node_executions"]
    if any(
        isinstance(execution, dict)
        and execution.get("node_id") == current_node_id
        and execution.get("status") == "failed"
        and INTERRUPTED_RUN_MESSAGE in (execution.get("errors") or [])
        for execution in node_executions
    ):
        return

    node_executions.append(
        {
            "node_id": current_node_id,
            "node_type": _resolve_node_type(run, current_node_id),
            "status": "failed",
            "started_at": None,
            "finished_at": now,
            "duration_ms": 0,
            "input_summary": "",
            "output_summary": "",
            "artifacts": {},
            "warnings": [],
            "errors": [INTERRUPTED_RUN_MESSAGE],
        }
    )


def _without_message(values: Any, message: str) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(value) for value in values if str(value) != message]


def _resolve_node_type(run: dict[str, Any], node_id: str) -> str:
    graph_snapshot = run.get("graph_snapshot")
    if not isinstance(graph_snapshot, dict):
        return ""
    nodes = graph_snapshot.get("nodes")
    if not isinstance(nodes, dict):
        return ""
    node = nodes.get(node_id)
    if not isinstance(node, dict):
        return ""
    return str(node.get("kind") or "")

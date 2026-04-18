from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.runtime.state import utc_now_iso


INTERRUPTED_RUN_MESSAGE = "Run was interrupted because the backend service restarted before it completed."


def start_node_execution(
    state: dict[str, Any],
    *,
    node_id: str,
    node_type: str,
    started_at: str | None = None,
    iteration: int | None = None,
    artifacts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    executions = state.setdefault("node_executions", [])
    if not isinstance(executions, list):
        executions = []
        state["node_executions"] = executions
    attempt = sum(
        1
        for execution in executions
        if isinstance(execution, dict) and execution.get("node_id") == node_id
    ) + 1
    execution = {
        "execution_id": f"{node_id}:{len(executions) + 1}",
        "attempt": attempt,
        "node_id": node_id,
        "node_type": node_type,
        "status": "running",
        "started_at": started_at or utc_now_iso(),
        "finished_at": None,
        "duration_ms": 0,
        "input_summary": "",
        "output_summary": "",
        "artifacts": {
            "family": node_type,
            "iteration": iteration,
            "inputs": {},
            "outputs": {},
            "state_reads": [],
            "state_writes": [],
            **dict(artifacts or {}),
        },
        "warnings": [],
        "errors": [],
    }
    executions.append(execution)
    return execution


def finish_node_execution(
    execution: dict[str, Any],
    *,
    status: str,
    finished_at: str | None = None,
    duration_ms: int | None = None,
    input_summary: str = "",
    output_summary: str = "",
    artifacts: dict[str, Any] | None = None,
    warnings: list[str] | None = None,
    errors: list[str] | None = None,
) -> dict[str, Any]:
    resolved_finished_at = finished_at or utc_now_iso()
    execution["status"] = status
    execution["finished_at"] = resolved_finished_at
    execution["duration_ms"] = (
        max(int(duration_ms), 0)
        if duration_ms is not None
        else duration_between_iso_ms(execution.get("started_at"), resolved_finished_at)
    )
    execution["input_summary"] = input_summary
    execution["output_summary"] = output_summary
    execution["artifacts"] = {
        **dict(execution.get("artifacts") or {}),
        **dict(artifacts or {}),
    }
    execution["warnings"] = list(warnings or [])
    execution["errors"] = list(errors or [])
    return execution


def find_latest_running_execution(state: dict[str, Any], node_id: str) -> dict[str, Any] | None:
    executions = state.get("node_executions")
    if not isinstance(executions, list):
        return None
    for execution in reversed(executions):
        if not isinstance(execution, dict):
            continue
        if execution.get("node_id") == node_id and execution.get("status") == "running":
            return execution
    return None


def duration_between_iso_ms(started_at: Any, finished_at: Any) -> int:
    try:
        started = datetime.fromisoformat(str(started_at))
        finished = datetime.fromisoformat(str(finished_at))
    except (TypeError, ValueError):
        return 0
    return max(int((finished - started).total_seconds() * 1000), 0)

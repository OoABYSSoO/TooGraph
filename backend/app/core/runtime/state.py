from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, TypedDict
from uuid import uuid4


RunStatus = Literal["queued", "running", "completed", "failed"]
NodeStatus = Literal["idle", "running", "success", "failed"]


class RunState(TypedDict, total=False):
    """Runtime state for node_system graph execution."""
    run_id: str
    graph_id: str
    graph_name: str
    status: RunStatus
    current_node_id: str | None
    metadata: dict[str, Any]
    revision_round: int
    max_revision_round: int
    selected_skills: list[str]
    skill_outputs: list[dict[str, Any]]
    evaluation_result: dict[str, Any]
    final_result: str
    node_status_map: dict[str, NodeStatus]
    node_executions: list[dict[str, Any]]
    warnings: list[str]
    errors: list[str]
    output_previews: list[dict[str, Any]]
    saved_outputs: list[dict[str, Any]]
    state_values: dict[str, Any]
    state_last_writers: dict[str, dict[str, Any]]
    state_events: list[dict[str, Any]]
    started_at: str
    completed_at: str | None
    duration_ms: int | None
    artifacts: dict[str, Any]
    state_snapshot: dict[str, Any]
    cycle_summary: dict[str, Any]
    cycle_iterations: list[dict[str, Any]]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_initial_run_state(graph_id: str, graph_name: str, max_revision_round: int = 1) -> RunState:
    return RunState(
        run_id=f"run_{uuid4().hex[:12]}",
        graph_id=graph_id,
        graph_name=graph_name,
        status="queued",
        current_node_id=None,
        revision_round=0,
        max_revision_round=max_revision_round,
        selected_skills=[],
        skill_outputs=[],
        evaluation_result={},
        final_result="",
        node_status_map={},
        node_executions=[],
        warnings=[],
        errors=[],
        output_previews=[],
        saved_outputs=[],
        state_values={},
        state_last_writers={},
        state_events=[],
        cycle_summary={},
        cycle_iterations=[],
        started_at=utc_now_iso(),
        completed_at=None,
    )

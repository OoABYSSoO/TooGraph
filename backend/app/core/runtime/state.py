from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, TypedDict
from uuid import uuid4


RunStatus = Literal["queued", "running", "paused", "awaiting_human", "resuming", "completed", "failed"]
NodeStatus = Literal["idle", "running", "paused", "success", "failed"]


class RunCheckpointMetadata(TypedDict, total=False):
    available: bool
    checkpoint_id: str | None
    thread_id: str | None
    checkpoint_ns: str | None
    saver: str | None
    resume_source: str | None


class RunLifecycle(TypedDict, total=False):
    updated_at: str
    paused_at: str | None
    resumed_at: str | None
    pause_reason: str | None
    resume_count: int
    resumed_from_run_id: str | None


class RunSnapshot(TypedDict, total=False):
    snapshot_id: str
    kind: str
    label: str
    created_at: str
    status: str
    current_node_id: str | None
    checkpoint_metadata: RunCheckpointMetadata
    state_snapshot: dict[str, Any]
    graph_snapshot: dict[str, Any]
    artifacts: dict[str, Any]
    node_status_map: dict[str, NodeStatus]
    subgraph_status_map: dict[str, dict[str, NodeStatus]]
    output_previews: list[dict[str, Any]]
    final_result: str


class RunState(TypedDict, total=False):
    """Runtime state for node_system graph execution."""
    run_id: str
    graph_id: str
    graph_name: str
    status: RunStatus
    runtime_backend: str
    current_node_id: str | None
    metadata: dict[str, Any]
    lifecycle: RunLifecycle
    checkpoint_metadata: RunCheckpointMetadata
    revision_round: int
    max_revision_round: int
    selected_skills: list[str]
    skill_outputs: list[dict[str, Any]]
    evaluation_result: dict[str, Any]
    final_result: str
    node_status_map: dict[str, NodeStatus]
    subgraph_status_map: dict[str, dict[str, NodeStatus]]
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
    graph_snapshot: dict[str, Any]
    run_snapshots: list[RunSnapshot]
    cycle_summary: dict[str, Any]
    cycle_iterations: list[dict[str, Any]]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_run_lifecycle(state: RunState) -> RunLifecycle:
    lifecycle = state.setdefault(
        "lifecycle",
        RunLifecycle(
            updated_at=utc_now_iso(),
            paused_at=None,
            resumed_at=None,
            pause_reason=None,
            resume_count=0,
            resumed_from_run_id=None,
        ),
    )
    lifecycle.setdefault("updated_at", utc_now_iso())
    lifecycle.setdefault("paused_at", None)
    lifecycle.setdefault("resumed_at", None)
    lifecycle.setdefault("pause_reason", None)
    lifecycle.setdefault("resume_count", 0)
    lifecycle.setdefault("resumed_from_run_id", None)
    return lifecycle


def ensure_checkpoint_metadata(state: RunState) -> RunCheckpointMetadata:
    checkpoint_metadata = state.setdefault(
        "checkpoint_metadata",
        RunCheckpointMetadata(
            available=False,
            checkpoint_id=None,
            thread_id=state.get("run_id"),
            checkpoint_ns=None,
            saver=None,
            resume_source=None,
        ),
    )
    checkpoint_metadata.setdefault("available", False)
    checkpoint_metadata.setdefault("checkpoint_id", None)
    checkpoint_metadata.setdefault("thread_id", state.get("run_id"))
    checkpoint_metadata.setdefault("checkpoint_ns", None)
    checkpoint_metadata.setdefault("saver", None)
    checkpoint_metadata.setdefault("resume_source", None)
    return checkpoint_metadata


def touch_run_lifecycle(state: RunState) -> None:
    lifecycle = ensure_run_lifecycle(state)
    lifecycle["updated_at"] = utc_now_iso()


def set_run_status(
    state: RunState,
    status: RunStatus,
    *,
    pause_reason: str | None = None,
    resumed_from_run_id: str | None = None,
) -> None:
    now = utc_now_iso()
    lifecycle = ensure_run_lifecycle(state)
    ensure_checkpoint_metadata(state)
    state["status"] = status
    lifecycle["updated_at"] = now

    if status in {"paused", "awaiting_human"}:
        lifecycle["paused_at"] = now
        lifecycle["pause_reason"] = pause_reason
    elif status == "resuming":
        lifecycle["resumed_at"] = now
        lifecycle["resume_count"] = int(lifecycle.get("resume_count", 0) or 0) + 1
        lifecycle["resumed_from_run_id"] = resumed_from_run_id
        lifecycle["pause_reason"] = None
    elif status == "running":
        lifecycle["pause_reason"] = None

    if status in {"completed", "failed"}:
        state["completed_at"] = now


def create_initial_run_state(graph_id: str, graph_name: str, max_revision_round: int = 1) -> RunState:
    run_id = f"run_{uuid4().hex[:12]}"
    state = RunState(
        run_id=run_id,
        graph_id=graph_id,
        graph_name=graph_name,
        status="queued",
        runtime_backend="",
        current_node_id=None,
        lifecycle=RunLifecycle(
            updated_at=utc_now_iso(),
            paused_at=None,
            resumed_at=None,
            pause_reason=None,
            resume_count=0,
            resumed_from_run_id=None,
        ),
        checkpoint_metadata=RunCheckpointMetadata(
            available=False,
            checkpoint_id=None,
            thread_id=run_id,
            checkpoint_ns=None,
            saver=None,
            resume_source=None,
        ),
        revision_round=0,
        max_revision_round=max_revision_round,
        selected_skills=[],
        skill_outputs=[],
        evaluation_result={},
        final_result="",
        node_status_map={},
        subgraph_status_map={},
        node_executions=[],
        warnings=[],
        errors=[],
        output_previews=[],
        saved_outputs=[],
        state_values={},
        state_last_writers={},
        state_events=[],
        run_snapshots=[],
        cycle_summary={},
        cycle_iterations=[],
        started_at=utc_now_iso(),
        completed_at=None,
    )
    return state

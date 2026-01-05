from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, TypedDict
from uuid import uuid4


RunStatus = Literal["queued", "running", "completed", "failed"]
NodeStatus = Literal["idle", "running", "success", "failed"]
Decision = Literal["pass", "revise", "fail"]


class RunState(TypedDict, total=False):
    run_id: str
    graph_id: str
    graph_name: str
    status: RunStatus
    current_node_id: str | None
    revision_round: int
    max_revision_round: int
    task_input: str
    retrieved_knowledge: list[str]
    matched_memories: list[str]
    plan: str
    selected_skills: list[str]
    skill_outputs: list[dict[str, Any]]
    evaluation_result: dict[str, Any]
    final_result: str
    node_status_map: dict[str, NodeStatus]
    node_executions: list[dict[str, Any]]
    warnings: list[str]
    errors: list[str]
    started_at: str
    completed_at: str | None


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
        task_input="",
        retrieved_knowledge=[],
        matched_memories=[],
        plan="",
        selected_skills=[],
        skill_outputs=[],
        evaluation_result={},
        final_result="",
        node_status_map={},
        node_executions=[],
        warnings=[],
        errors=[],
        started_at=utc_now_iso(),
        completed_at=None,
    )


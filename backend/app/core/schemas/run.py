from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RunSummary(BaseModel):
    """Summary returned by GET /api/runs."""
    run_id: str
    graph_id: str
    graph_name: str
    status: str
    current_node_id: str | None = None
    revision_round: int = 0
    started_at: str
    completed_at: str | None = None
    duration_ms: int | None = None


class RunDetail(RunSummary):
    """Full detail returned by GET /api/runs/{run_id}."""
    selected_skills: list[str] = Field(default_factory=list)
    skill_outputs: list[dict[str, Any]] = Field(default_factory=list)
    evaluation_result: dict[str, Any] = Field(default_factory=dict)
    final_result: str = ""
    node_status_map: dict[str, str] = Field(default_factory=dict)
    node_executions: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    output_previews: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    state_snapshot: dict[str, Any] = Field(default_factory=dict)


class NodeExecutionDetail(BaseModel):
    """Per-node execution detail returned by GET /api/runs/{run_id}/nodes/{node_id}."""
    node_id: str
    node_type: str
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    duration_ms: int = 0
    input_summary: str = ""
    output_summary: str = ""
    artifacts: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

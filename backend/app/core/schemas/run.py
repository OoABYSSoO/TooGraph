from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class RunSummary(BaseModel):
    run_id: str
    graph_id: str
    graph_name: str
    status: str
    current_node_id: str | None = None
    revision_round: int = 0
    started_at: str
    completed_at: str | None = None
    final_result: str | None = None
    duration_ms: int | None = None
    final_score: float | None = None


class RunDetail(RunSummary):
    task_input: str = ""
    retrieved_knowledge: list[str] = Field(default_factory=list)
    matched_memories: list[str] = Field(default_factory=list)
    knowledge_summary: str = ""
    memory_summary: str = ""
    plan: str = ""
    selected_skills: list[str] = Field(default_factory=list)
    skill_outputs: list[dict[str, Any]] = Field(default_factory=list)
    evaluation_result: dict[str, Any] = Field(default_factory=dict)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    node_status_map: dict[str, str] = Field(default_factory=dict)
    node_executions: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    state_snapshot: dict[str, Any] = Field(default_factory=dict)


class NodeExecutionDetail(BaseModel):
    node_id: str
    node_type: str
    status: str
    started_at: str | None = None
    finished_at: str | None = None
    duration_ms: int
    input_summary: str
    output_summary: str
    artifacts: dict[str, Any] = Field(default_factory=dict)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

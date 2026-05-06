from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SavedOutputArtifact(BaseModel):
    node_id: str | None = None
    source_key: str
    path: str
    format: str
    file_name: str


class OutputPreview(BaseModel):
    node_id: str | None = None
    label: str | None = None
    source_kind: str = "node_output"
    source_key: str
    display_mode: str = "auto"
    persist_enabled: bool = False
    persist_format: str = "auto"
    value: Any = None


class ExportedOutput(OutputPreview):
    saved_file: SavedOutputArtifact | None = None


class StateWriterRecord(BaseModel):
    node_id: str
    output_key: str
    mode: str = "replace"
    updated_at: str | None = None


class StateSnapshot(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)
    last_writers: dict[str, StateWriterRecord] = Field(default_factory=dict)


class StateEvent(BaseModel):
    node_id: str
    state_key: str
    output_key: str
    mode: str = "replace"
    value: Any = None
    created_at: str


class CycleIterationRecord(BaseModel):
    iteration: int
    executed_node_ids: list[str] = Field(default_factory=list)
    incoming_edge_ids: list[str] = Field(default_factory=list)
    activated_edge_ids: list[str] = Field(default_factory=list)
    next_iteration_edge_ids: list[str] = Field(default_factory=list)
    stop_reason: str | None = None


class CycleSummary(BaseModel):
    has_cycle: bool = False
    back_edges: list[str] = Field(default_factory=list)
    iteration_count: int = 0
    max_iterations: int = 0
    stop_reason: str | None = None


class CheckpointMetadata(BaseModel):
    available: bool = False
    checkpoint_id: str | None = None
    thread_id: str | None = None
    checkpoint_ns: str | None = None
    saver: str | None = None
    resume_source: str | None = None


class RunSnapshot(BaseModel):
    snapshot_id: str
    kind: str
    label: str
    created_at: str
    status: str
    current_node_id: str | None = None
    checkpoint_metadata: CheckpointMetadata = Field(default_factory=CheckpointMetadata)
    state_snapshot: StateSnapshot = Field(default_factory=StateSnapshot)
    graph_snapshot: dict[str, Any] = Field(default_factory=dict)
    artifacts: dict[str, Any] = Field(default_factory=dict)
    node_status_map: dict[str, str] = Field(default_factory=dict)
    subgraph_status_map: dict[str, dict[str, str]] = Field(default_factory=dict)
    output_previews: list[OutputPreview] = Field(default_factory=list)
    final_result: str = ""


class RunSnapshotOption(BaseModel):
    snapshot_id: str | None = None
    kind: str
    label: str
    status: str
    current_node_id: str | None = None


class RunLifecycleRecord(BaseModel):
    updated_at: str = ""
    paused_at: str | None = None
    resumed_at: str | None = None
    pause_reason: str | None = None
    resume_count: int = 0
    resumed_from_run_id: str | None = None


class NodeStateReadRecord(BaseModel):
    state_key: str
    input_key: str
    value: Any = None


class NodeStateWriteRecord(BaseModel):
    state_key: str
    output_key: str
    mode: str = "replace"
    value: Any = None
    changed: bool = False


class NodeExecutionArtifacts(BaseModel):
    inputs: dict[str, Any] = Field(default_factory=dict)
    outputs: dict[str, Any] = Field(default_factory=dict)
    family: str = ""
    iteration: int | None = None
    subgraph: dict[str, Any] | None = None
    selected_branch: str | None = None
    response: dict[str, Any] | None = None
    reasoning: str | None = None
    runtime_config: dict[str, Any] | None = None
    state_reads: list[NodeStateReadRecord] = Field(default_factory=list)
    state_writes: list[NodeStateWriteRecord] = Field(default_factory=list)


class RunArtifacts(BaseModel):
    skill_outputs: list[dict[str, Any]] = Field(default_factory=list)
    output_previews: list[OutputPreview] = Field(default_factory=list)
    saved_outputs: list[SavedOutputArtifact] = Field(default_factory=list)
    exported_outputs: list[ExportedOutput] = Field(default_factory=list)
    node_outputs: dict[str, dict[str, Any]] = Field(default_factory=dict)
    active_edge_ids: list[str] = Field(default_factory=list)
    state_events: list[StateEvent] = Field(default_factory=list)
    state_values: dict[str, Any] = Field(default_factory=dict)
    streaming_outputs: dict[str, dict[str, Any]] = Field(default_factory=dict)
    cycle_iterations: list[CycleIterationRecord] = Field(default_factory=list)
    cycle_summary: CycleSummary = Field(default_factory=CycleSummary)


class RunSummary(BaseModel):
    """Summary returned by GET /api/runs."""
    run_id: str
    graph_id: str | None = None
    graph_name: str
    status: str
    restorable_snapshot_available: bool = False
    run_snapshot_options: list[RunSnapshotOption] = Field(default_factory=list)
    runtime_backend: str = ""
    lifecycle: RunLifecycleRecord = Field(default_factory=RunLifecycleRecord)
    checkpoint_metadata: CheckpointMetadata = Field(default_factory=CheckpointMetadata)
    current_node_id: str | None = None
    revision_round: int = 0
    started_at: str
    completed_at: str | None = None
    duration_ms: int | None = None
    final_score: float | None = None


class RunDetail(RunSummary):
    """Full detail returned by GET /api/runs/{run_id}."""
    metadata: dict[str, Any] = Field(default_factory=dict)
    selected_skills: list[str] = Field(default_factory=list)
    skill_outputs: list[dict[str, Any]] = Field(default_factory=list)
    evaluation_result: dict[str, Any] = Field(default_factory=dict)
    memory_summary: str = ""
    final_result: str = ""
    node_status_map: dict[str, str] = Field(default_factory=dict)
    subgraph_status_map: dict[str, dict[str, str]] = Field(default_factory=dict)
    node_executions: list[NodeExecutionDetail] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    output_previews: list[OutputPreview] = Field(default_factory=list)
    artifacts: RunArtifacts = Field(default_factory=RunArtifacts)
    state_snapshot: StateSnapshot = Field(default_factory=StateSnapshot)
    graph_snapshot: dict[str, Any] = Field(default_factory=dict)
    run_snapshots: list[RunSnapshot] = Field(default_factory=list)
    cycle_summary: CycleSummary = Field(default_factory=CycleSummary)


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
    artifacts: NodeExecutionArtifacts = Field(default_factory=NodeExecutionArtifacts)
    warnings: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

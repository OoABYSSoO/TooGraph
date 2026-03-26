from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class LangGraphNodePlan(BaseModel):
    name: str
    kind: str
    description: str = ""
    reads: list[str] = Field(default_factory=list)
    writes: list[str] = Field(default_factory=list)
    skill_keys: list[str] = Field(default_factory=list)
    config: dict[str, Any] = Field(default_factory=dict)


class LangGraphEdgePlan(BaseModel):
    source: str
    target: str


class LangGraphConditionalEdgePlan(BaseModel):
    source: str
    branches: dict[str, str] = Field(default_factory=dict)


class LangGraphRuntimeConditionStepPlan(BaseModel):
    condition: str
    branch: str
    target: str


class LangGraphBoundaryPlan(BaseModel):
    node: str
    state: str


class LangGraphRuntimeConditionRoutePlan(BaseModel):
    source: str
    condition: str
    branches: dict[str, str] = Field(default_factory=dict)
    branch_targets: dict[str, str] = Field(default_factory=dict)
    branch_paths: dict[str, list[LangGraphRuntimeConditionStepPlan]] = Field(default_factory=dict)


class LangGraphRuntimeRequirements(BaseModel):
    entry_nodes: list[str] = Field(default_factory=list)
    terminal_nodes: list[str] = Field(default_factory=list)
    runtime_entry_nodes: list[str] = Field(default_factory=list)
    runtime_terminal_nodes: list[str] = Field(default_factory=list)
    skill_keys: list[str] = Field(default_factory=list)
    knowledge_base_states: list[str] = Field(default_factory=list)
    unsupported_reasons: list[str] = Field(default_factory=list)


class LangGraphBuildPlan(BaseModel):
    graph_id: str = ""
    name: str
    state_schema: dict[str, dict[str, Any]] = Field(default_factory=dict)
    nodes: dict[str, LangGraphNodePlan] = Field(default_factory=dict)
    edges: list[LangGraphEdgePlan] = Field(default_factory=list)
    conditional_edges: list[LangGraphConditionalEdgePlan] = Field(default_factory=list)
    runtime_nodes: dict[str, LangGraphNodePlan] = Field(default_factory=dict)
    runtime_edges: list[LangGraphEdgePlan] = Field(default_factory=list)
    runtime_condition_routes: list[LangGraphRuntimeConditionRoutePlan] = Field(default_factory=list)
    input_boundaries: list[LangGraphBoundaryPlan] = Field(default_factory=list)
    output_boundaries: list[LangGraphBoundaryPlan] = Field(default_factory=list)
    requirements: LangGraphRuntimeRequirements = Field(default_factory=LangGraphRuntimeRequirements)

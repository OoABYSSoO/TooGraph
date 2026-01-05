from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NodeType(str, Enum):
    INPUT = "input"
    KNOWLEDGE = "knowledge"
    MEMORY = "memory"
    PLANNER = "planner"
    SKILL_EXECUTOR = "skill_executor"
    EVALUATOR = "evaluator"
    FINALIZER = "finalizer"


class EdgeType(str, Enum):
    NORMAL = "normal"
    CONDITIONAL = "conditional"


class ConditionLabel(str, Enum):
    PASS = "pass"
    REVISE = "revise"
    FAIL = "fail"


class Position(BaseModel):
    x: float
    y: float


class GraphNode(BaseModel):
    id: str = Field(..., min_length=1)
    type: NodeType
    label: str = Field(..., min_length=1)
    position: Position
    config: dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    id: str = Field(..., min_length=1)
    type: EdgeType = EdgeType.NORMAL
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    condition_label: ConditionLabel | None = None

    @model_validator(mode="after")
    def validate_condition_label(self) -> "GraphEdge":
        if self.type == EdgeType.CONDITIONAL and self.condition_label is None:
            raise ValueError("Conditional edges must include condition_label.")
        if self.type == EdgeType.NORMAL and self.condition_label is not None:
            raise ValueError("Normal edges cannot include condition_label.")
        return self


class GraphPayload(BaseModel):
    graph_id: str | None = None
    name: str = Field(..., min_length=1)
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Graph name cannot be empty.")
        return value


class GraphDocument(GraphPayload):
    graph_id: str = Field(..., min_length=1)


class ValidationIssue(BaseModel):
    code: str
    message: str
    path: str | None = None


class GraphValidationResponse(BaseModel):
    valid: bool
    issues: list[ValidationIssue] = Field(default_factory=list)


class GraphSaveResponse(BaseModel):
    graph_id: str
    saved: bool = True
    validation: GraphValidationResponse


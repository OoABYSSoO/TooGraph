from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NodeType(str, Enum):
    START = "start"
    END = "end"
    CONDITION = "condition"
    RESEARCH = "research"
    COLLECT_ASSETS = "collect_assets"
    NORMALIZE_ASSETS = "normalize_assets"
    SELECT_ASSETS = "select_assets"
    ANALYZE_ASSETS = "analyze_assets"
    EXTRACT_PATTERNS = "extract_patterns"
    BUILD_BRIEF = "build_brief"
    GENERATE_VARIANTS = "generate_variants"
    GENERATE_STORYBOARDS = "generate_storyboards"
    GENERATE_VIDEO_PROMPTS = "generate_video_prompts"
    REVIEW_VARIANTS = "review_variants"
    PREPARE_IMAGE_TODO = "prepare_image_todo"
    PREPARE_VIDEO_TODO = "prepare_video_todo"
    FINALIZE = "finalize"
    HELLO_MODEL = "hello_model"
    KNOWLEDGE = "knowledge"
    MEMORY = "memory"
    PLANNER = "planner"
    EVALUATOR = "evaluator"
    TOOL = "tool"
    TRANSFORM = "transform"


class EdgeKind(str, Enum):
    NORMAL = "normal"
    BRANCH = "branch"


class ConditionLabel(str, Enum):
    PASS = "pass"
    REVISE = "revise"
    FAIL = "fail"


class StateFieldType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    OBJECT = "object"
    ARRAY = "array"
    MARKDOWN = "markdown"
    JSON = "json"
    FILE_LIST = "file_list"


class StateFieldRole(str, Enum):
    INPUT = "input"
    INTERMEDIATE = "intermediate"
    DECISION = "decision"
    ARTIFACT = "artifact"
    FINAL = "final"


class Position(BaseModel):
    x: float
    y: float


class ThemeConfig(BaseModel):
    theme_preset: str = ""
    domain: str = ""
    genre: str = ""
    market: str = ""
    platform: str = ""
    language: str = ""
    creative_style: str = ""
    tone: str = ""
    language_constraints: list[str] = Field(default_factory=list)
    evaluation_policy: dict[str, Any] = Field(default_factory=dict)
    asset_source_policy: dict[str, Any] = Field(default_factory=dict)
    strategy_profile: dict[str, Any] = Field(default_factory=dict)


class StateField(BaseModel):
    key: str = Field(..., min_length=1)
    type: StateFieldType = StateFieldType.STRING
    role: StateFieldRole = StateFieldRole.INTERMEDIATE
    title: str = ""
    description: str = ""
    example: Any = None
    source_nodes: list[str] = Field(default_factory=list)
    target_nodes: list[str] = Field(default_factory=list)

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        key = value.strip()
        if not key:
            raise ValueError("State field key cannot be empty.")
        return key


class NodeImplementation(BaseModel):
    executor: str = "node_handler"
    handler_key: str = ""
    tool_keys: list[str] = Field(default_factory=list)


class GraphNode(BaseModel):
    id: str = Field(..., min_length=1)
    type: NodeType
    label: str = Field(..., min_length=1)
    position: Position
    reads: list[str] = Field(default_factory=list)
    writes: list[str] = Field(default_factory=list)
    params: dict[str, Any] = Field(default_factory=dict)
    implementation: NodeImplementation = Field(default_factory=NodeImplementation)
    config: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def normalize_config_and_params(self) -> "GraphNode":
        if self.config and not self.params:
            self.params = dict(self.config)
        elif self.params and not self.config:
            self.config = dict(self.params)
        elif not self.params and not self.config:
            self.params = {}
            self.config = {}

        if not self.implementation.handler_key:
            self.implementation.handler_key = self.type.value
        return self


class GraphEdge(BaseModel):
    id: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    flow_keys: list[str] = Field(default_factory=list)
    edge_kind: EdgeKind = EdgeKind.NORMAL
    branch_label: ConditionLabel | None = None

    @model_validator(mode="after")
    def normalize_edge_fields(self) -> "GraphEdge":
        if self.edge_kind == EdgeKind.BRANCH and self.branch_label is None:
            raise ValueError("Branch edges must include branch_label.")
        if self.edge_kind == EdgeKind.NORMAL and self.branch_label is not None:
            raise ValueError("Normal edges cannot include branch_label.")
        return self


class GraphPayload(BaseModel):
    graph_id: str | None = None
    name: str = Field(..., min_length=1)
    template_id: str = ""
    theme_config: ThemeConfig = Field(default_factory=ThemeConfig)
    state_schema: list[StateField] = Field(default_factory=list)
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

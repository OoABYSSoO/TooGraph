from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def _validate_identifier(value: str, *, label: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{label} cannot be empty.")
    if ":" in normalized:
        raise ValueError(f"{label} cannot contain ':'.")
    return normalized


def _reject_legacy_default_value_alias(data: Any) -> Any:
    if isinstance(data, dict) and "defaultValue" in data:
        raise ValueError("'defaultValue' is no longer supported. Use 'value' instead.")
    return data


class Position(BaseModel):
    x: float
    y: float


class NodeViewportSize(BaseModel):
    width: float | None = None
    height: float | None = None

    model_config = ConfigDict(extra="ignore")


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


class NodeSystemStateType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    OBJECT = "object"
    ARRAY = "array"
    MARKDOWN = "markdown"
    JSON = "json"
    FILE_LIST = "file_list"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    FILE = "file"
    KNOWLEDGE_BASE = "knowledge_base"


class StateWriteMode(str, Enum):
    REPLACE = "replace"


class AgentModelSource(str, Enum):
    GLOBAL = "global"
    OVERRIDE = "override"


class AgentThinkingMode(str, Enum):
    OFF = "off"
    ON = "on"


class ConditionOperator(str, Enum):
    EQ = "=="
    NE = "!="
    GTE = ">="
    LTE = "<="
    GT = ">"
    LT = "<"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    EXISTS = "exists"


class DisplayMode(str, Enum):
    AUTO = "auto"
    PLAIN = "plain"
    MARKDOWN = "markdown"
    JSON = "json"


class PersistFormat(str, Enum):
    TXT = "txt"
    MD = "md"
    JSON = "json"
    AUTO = "auto"


class NodeSystemStateDefinition(BaseModel):
    name: str = ""
    description: str = ""
    type: NodeSystemStateType = NodeSystemStateType.TEXT
    value: Any = Field(default=None)
    color: str = ""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_default_value_alias(cls, data: Any) -> Any:
        return _reject_legacy_default_value_alias(data)


class NodeSystemReadBinding(BaseModel):
    state: str = Field(..., min_length=1)
    required: bool = False

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: str) -> str:
        return _validate_identifier(value, label="State reference")


class NodeSystemWriteBinding(BaseModel):
    state: str = Field(..., min_length=1)
    mode: StateWriteMode = StateWriteMode.REPLACE

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("state")
    @classmethod
    def validate_state(cls, value: str) -> str:
        return _validate_identifier(value, label="State reference")


class NodeSystemNodeUi(BaseModel):
    position: Position
    collapsed: bool = False
    expanded_size: NodeViewportSize | None = Field(default=None, alias="expandedSize")
    collapsed_size: NodeViewportSize | None = Field(default=None, alias="collapsedSize")

    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class NodeSystemInputConfig(BaseModel):
    value: Any = Field(default="")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_default_value_alias(cls, data: Any) -> Any:
        return _reject_legacy_default_value_alias(data)


class NodeSystemAgentConfig(BaseModel):
    skills: list[str] = Field(default_factory=list)
    task_instruction: str = Field(default="", alias="taskInstruction")
    model_source: AgentModelSource = Field(default=AgentModelSource.GLOBAL, alias="modelSource")
    model: str = ""
    thinking_mode: AgentThinkingMode = Field(default=AgentThinkingMode.ON, alias="thinkingMode")
    temperature: float = Field(default=0.2, ge=0, le=2)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class NodeSystemConditionRule(BaseModel):
    source: str = Field(..., min_length=1)
    operator: ConditionOperator = ConditionOperator.EXISTS
    value: str | int | float | bool | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class NodeSystemConditionConfig(BaseModel):
    branches: list[str] = Field(default_factory=list)
    loop_limit: int = Field(default=5, alias="loopLimit")
    branch_mapping: dict[str, str] = Field(default_factory=dict, alias="branchMapping")
    rule: NodeSystemConditionRule = Field(
        default_factory=lambda: NodeSystemConditionRule(source="result", operator=ConditionOperator.EXISTS, value=None)
    )

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_condition_mode_alias(cls, data: Any) -> Any:
        if isinstance(data, dict) and "conditionMode" in data:
            raise ValueError("'conditionMode' is no longer supported.")
        return data

    @field_validator("branches")
    @classmethod
    def validate_branches(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for branch in value:
            next_branch = _validate_identifier(branch, label="Condition branch")
            if next_branch in seen:
                raise ValueError(f"Duplicate condition branch '{next_branch}' detected.")
            seen.add(next_branch)
            normalized.append(next_branch)
        return normalized

    @field_validator("branch_mapping")
    @classmethod
    def validate_branch_mapping(cls, value: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for mapping_key, branch in value.items():
            next_key = mapping_key.strip()
            if not next_key:
                raise ValueError("Condition branch mapping key cannot be empty.")
            normalized[next_key] = _validate_identifier(branch, label="Condition branch")
        return normalized

    @field_validator("loop_limit")
    @classmethod
    def validate_loop_limit(cls, value: int) -> int:
        if value == -1:
            return 5
        if value < 1:
            raise ValueError("Condition loop limit must be a positive integer.")
        if value > 10:
            raise ValueError("Condition loop limit cannot exceed 10.")
        return value


class NodeSystemOutputConfig(BaseModel):
    display_mode: DisplayMode = Field(default=DisplayMode.AUTO, alias="displayMode")
    persist_enabled: bool = Field(default=False, alias="persistEnabled")
    persist_format: PersistFormat = Field(default=PersistFormat.AUTO, alias="persistFormat")
    file_name_template: str = Field(default="", alias="fileNameTemplate")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class NodeSystemInputNode(BaseModel):
    kind: Literal["input"] = "input"
    name: str = ""
    description: str = ""
    ui: NodeSystemNodeUi
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    config: NodeSystemInputConfig = Field(default_factory=NodeSystemInputConfig)


class NodeSystemAgentNode(BaseModel):
    kind: Literal["agent"] = "agent"
    name: str = ""
    description: str = ""
    ui: NodeSystemNodeUi
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    config: NodeSystemAgentConfig = Field(default_factory=NodeSystemAgentConfig)


class NodeSystemConditionNode(BaseModel):
    kind: Literal["condition"] = "condition"
    name: str = ""
    description: str = ""
    ui: NodeSystemNodeUi
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    config: NodeSystemConditionConfig = Field(default_factory=NodeSystemConditionConfig)


class NodeSystemOutputNode(BaseModel):
    kind: Literal["output"] = "output"
    name: str = ""
    description: str = ""
    ui: NodeSystemNodeUi
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    config: NodeSystemOutputConfig = Field(default_factory=NodeSystemOutputConfig)


NodeSystemNode = (
    NodeSystemInputNode
    | NodeSystemAgentNode
    | NodeSystemConditionNode
    | NodeSystemOutputNode
)

NodeSystemNodeConfig = NodeSystemNode


class NodeSystemGraphEdge(BaseModel):
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @field_validator("source", "target")
    @classmethod
    def validate_node_ref(cls, value: str) -> str:
        return _validate_identifier(value, label="Node name")


class NodeSystemConditionalEdge(BaseModel):
    source: str = Field(..., min_length=1)
    branches: dict[str, str] = Field(default_factory=dict)

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        return _validate_identifier(value, label="Node name")

    @field_validator("branches")
    @classmethod
    def validate_branches(cls, value: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for branch, target in value.items():
            next_branch = _validate_identifier(branch, label="Condition branch")
            next_target = _validate_identifier(target, label="Node name")
            normalized[next_branch] = next_target
        return normalized


class NodeSystemGraphCore(BaseModel):
    state_schema: dict[str, NodeSystemStateDefinition] = Field(default_factory=dict)
    nodes: dict[str, NodeSystemNode] = Field(default_factory=dict)
    edges: list[NodeSystemGraphEdge] = Field(default_factory=list)
    conditional_edges: list[NodeSystemConditionalEdge] = Field(default_factory=list, alias="conditional_edges")
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="after")
    def validate_references(self) -> "NodeSystemGraphCore":
        state_names: set[str] = set()
        for state_name, definition in self.state_schema.items():
            state_names.add(_validate_identifier(state_name, label="State name"))
            definition.name = str(getattr(definition, "name", "") or "").strip() or state_name

        node_names: set[str] = set()
        for node_name, node in self.nodes.items():
            normalized_name = _validate_identifier(node_name, label="Node name")
            node_names.add(normalized_name)
            node.name = str(getattr(node, "name", "") or "").strip() or node_name
            for binding in [*node.reads, *node.writes]:
                if binding.state not in state_names:
                    raise ValueError(f"Node '{node_name}' references unknown state '{binding.state}'.")
            if isinstance(node, NodeSystemConditionNode):
                for branch in node.config.branches:
                    _validate_identifier(branch, label="Condition branch")

        for edge in self.edges:
            if edge.source not in node_names:
                raise ValueError(f"Edge source '{edge.source}' does not exist.")
            if edge.target not in node_names:
                raise ValueError(f"Edge target '{edge.target}' does not exist.")

        for conditional_edge in self.conditional_edges:
            if conditional_edge.source not in node_names:
                raise ValueError(f"Conditional edge source '{conditional_edge.source}' does not exist.")
            for target in conditional_edge.branches.values():
                if target not in node_names:
                    raise ValueError(
                        f"Conditional edge from '{conditional_edge.source}' references unknown target '{target}'."
                    )

        return self


class NodeSystemTemplate(NodeSystemGraphCore):
    template_id: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    description: str = ""
    default_graph_name: str = Field(..., min_length=1)

    @field_validator("template_id", "label", "default_graph_name")
    @classmethod
    def validate_template_fields(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Template field cannot be empty.")
        return normalized


class NodeSystemGraphPayload(NodeSystemGraphCore):
    graph_id: str | None = None
    name: str = Field(..., min_length=1)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Graph name cannot be empty.")
        return normalized


class NodeSystemGraphDocument(NodeSystemGraphPayload):
    graph_id: str = Field(..., min_length=1)

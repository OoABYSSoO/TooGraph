from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.thinking_levels import normalize_thinking_level


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


class NodeSystemNodeSize(BaseModel):
    width: float = Field(gt=0)
    height: float = Field(gt=0)


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
    revision_id: str
    validation: GraphValidationResponse


class NodeSystemCatalogStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class NodeSystemStateType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    MARKDOWN = "markdown"
    HTML = "html"
    JSON = "json"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    FILE = "file"
    KNOWLEDGE_BASE = "knowledge_base"
    CAPABILITY = "capability"
    RESULT_PACKAGE = "result_package"


class StateWriteMode(str, Enum):
    REPLACE = "replace"
    APPEND = "append"


class NodeSystemStateBindingKind(str, Enum):
    ACTION_OUTPUT = "action_output"
    TOOL_OUTPUT = "tool_output"
    CAPABILITY_RESULT = "capability_result"


class NodeSystemReadBindingKind(str, Enum):
    ACTION_INPUT = "action_input"
    TOOL_INPUT = "tool_input"


class BatchWorkerSource(str, Enum):
    DEFAULT_LLM = "default_llm"
    SUBGRAPH = "subgraph"


class BatchInputMode(str, Enum):
    SHARED = "shared"
    BATCH = "batch"


class NodeSystemStateBindingMetadata(BaseModel):
    kind: NodeSystemStateBindingKind = NodeSystemStateBindingKind.ACTION_OUTPUT
    action_key: str = Field(default="", alias="actionKey")
    tool_key: str = Field(default="", alias="toolKey")
    node_id: str = Field(..., min_length=1, alias="nodeId")
    field_key: str = Field(default="", alias="fieldKey")
    managed: bool = True

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_action_protocol_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict) and "skillKey" in data:
            raise ValueError("'skillKey' is no longer supported for state bindings. Use 'actionKey' instead.")
        return data

    @field_validator("node_id")
    @classmethod
    def validate_required_binding_identifier(cls, value: str) -> str:
        return _validate_identifier(value, label="State binding identifier")

    @field_validator("action_key", "tool_key", "field_key")
    @classmethod
    def validate_optional_binding_identifier(cls, value: str) -> str:
        stripped = value.strip()
        return _validate_identifier(stripped, label="State binding identifier") if stripped else ""

    @model_validator(mode="after")
    def validate_binding_shape(self) -> "NodeSystemStateBindingMetadata":
        if self.kind == NodeSystemStateBindingKind.ACTION_OUTPUT:
            self.action_key = _validate_identifier(self.action_key, label="Action key")
            self.tool_key = ""
            self.field_key = _validate_identifier(self.field_key, label="Action output field")
            return self
        if self.kind == NodeSystemStateBindingKind.TOOL_OUTPUT:
            self.tool_key = _validate_identifier(self.tool_key, label="Tool key")
            self.action_key = ""
            self.field_key = _validate_identifier(self.field_key, label="Tool output field")
            return self

        self.action_key = ""
        self.tool_key = ""
        self.field_key = self.field_key or "result_package"
        return self


class NodeSystemReadBindingMetadata(BaseModel):
    kind: NodeSystemReadBindingKind = NodeSystemReadBindingKind.ACTION_INPUT
    action_key: str = Field(default="", alias="actionKey")
    tool_key: str = Field(default="", alias="toolKey")
    field_key: str = Field(..., min_length=1, alias="fieldKey")
    managed: bool = True

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_action_protocol_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict) and "skillKey" in data:
            raise ValueError("'skillKey' is no longer supported for read bindings. Use 'actionKey' instead.")
        return data

    @field_validator("action_key", "tool_key", "field_key")
    @classmethod
    def validate_binding_identifier(cls, value: str) -> str:
        stripped = value.strip()
        return _validate_identifier(stripped, label="Read binding identifier") if stripped else ""

    @model_validator(mode="after")
    def validate_binding_shape(self) -> "NodeSystemReadBindingMetadata":
        if self.kind == NodeSystemReadBindingKind.ACTION_INPUT:
            self.action_key = _validate_identifier(self.action_key, label="Action key")
            self.tool_key = ""
            self.field_key = _validate_identifier(self.field_key, label="Action input field")
            return self
        if self.kind == NodeSystemReadBindingKind.TOOL_INPUT:
            self.tool_key = _validate_identifier(self.tool_key, label="Tool key")
            self.action_key = ""
            self.field_key = _validate_identifier(self.field_key, label="Tool input field")
            return self
        return self


class AgentModelSource(str, Enum):
    GLOBAL = "global"
    OVERRIDE = "override"


class AgentThinkingMode(str, Enum):
    OFF = "off"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    XHIGH = "xhigh"


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


FIXED_CONDITION_BRANCHES = ("true", "false", "exhausted")
FIXED_CONDITION_BRANCH_MAPPING = {"true": "true", "false": "false"}
CONDITION_LOOP_LIMIT_MIN = 1
CONDITION_LOOP_LIMIT_MAX = 10
CONDITION_LOOP_LIMIT_DEFAULT = 5


def _fixed_condition_branches() -> list[str]:
    return list(FIXED_CONDITION_BRANCHES)


def _fixed_condition_branch_mapping() -> dict[str, str]:
    return dict(FIXED_CONDITION_BRANCH_MAPPING)


class DisplayMode(str, Enum):
    AUTO = "auto"
    PLAIN = "plain"
    MARKDOWN = "markdown"
    HTML = "html"
    JSON = "json"
    DOCUMENTS = "documents"


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
    binding: NodeSystemStateBindingMetadata | None = None

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_default_value_alias(cls, data: Any) -> Any:
        return _reject_legacy_default_value_alias(data)


class NodeSystemReadBinding(BaseModel):
    state: str = Field(..., min_length=1)
    required: bool = False
    binding: NodeSystemReadBindingMetadata | None = None

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

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
    size: NodeSystemNodeSize | None = None

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class NodeSystemInputConfig(BaseModel):
    value: Any = Field(default="")
    boundary_type: NodeSystemStateType = Field(default=NodeSystemStateType.TEXT, alias="boundaryType")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_default_value_alias(cls, data: Any) -> Any:
        return _reject_legacy_default_value_alias(data)


class NodeSystemAgentActionBinding(BaseModel):
    action_key: str = Field(..., min_length=1, alias="actionKey")
    output_mapping: dict[str, str] = Field(default_factory=dict, alias="outputMapping")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_action_protocol_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict) and "skillKey" in data:
            raise ValueError("'skillKey' is no longer supported for action bindings. Use 'actionKey' instead.")
        return data

    @field_validator("action_key")
    @classmethod
    def validate_action_key(cls, value: str) -> str:
        return _validate_identifier(value, label="Action key")

    @field_validator("output_mapping")
    @classmethod
    def validate_output_mapping(cls, value: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for mapping_key, state_key in value.items():
            next_mapping_key = mapping_key.strip()
            if not next_mapping_key:
                raise ValueError("Action mapping key cannot be empty.")
            normalized[next_mapping_key] = _validate_identifier(state_key, label="State reference")
        return normalized


class NodeSystemActionInstructionBlock(BaseModel):
    action_key: str = Field(..., min_length=1, alias="actionKey")
    title: str = ""
    content: str = ""
    source: Literal["action.llmInstruction", "node.override"] = "action.llmInstruction"

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_action_protocol_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict) and "skillKey" in data:
            raise ValueError("'skillKey' is no longer supported for action instruction blocks. Use 'actionKey' instead.")
        if isinstance(data, dict) and data.get("source") == "skill.llmInstruction":
            raise ValueError("'skill.llmInstruction' is no longer supported. Use 'action.llmInstruction' instead.")
        return data

    @field_validator("action_key")
    @classmethod
    def validate_action_key(cls, value: str) -> str:
        return _validate_identifier(value, label="Action key")


class NodeSystemAgentConfig(BaseModel):
    action_key: str = Field(default="", alias="actionKey")
    action_bindings: list[NodeSystemAgentActionBinding] = Field(default_factory=list, alias="actionBindings")
    suspended_free_writes: list[NodeSystemWriteBinding] = Field(default_factory=list, alias="suspendedFreeWrites")
    action_instruction_blocks: dict[str, NodeSystemActionInstructionBlock] = Field(
        default_factory=dict,
        alias="actionInstructionBlocks",
    )
    task_instruction: str = Field(default="", alias="taskInstruction")
    model_source: AgentModelSource = Field(default=AgentModelSource.GLOBAL, alias="modelSource")
    model: str = ""
    thinking_mode: AgentThinkingMode = Field(default=AgentThinkingMode.HIGH, alias="thinkingMode")
    temperature: float = Field(default=0.2, ge=0, le=2)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_action_protocol_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            legacy_fields = ["skills", "skillKey", "skillBindings", "skillInstructionBlocks"]
            for legacy_field in legacy_fields:
                if legacy_field not in data:
                    continue
                replacement = {
                    "skills": "single actionKey",
                    "skillKey": "actionKey",
                    "skillBindings": "actionBindings",
                    "skillInstructionBlocks": "actionInstructionBlocks",
                }[legacy_field]
                raise ValueError(f"'{legacy_field}' is no longer supported for agent config. Use '{replacement}' instead.")
        return data

    @field_validator("action_key")
    @classmethod
    def validate_optional_action_key(cls, value: str) -> str:
        stripped = value.strip()
        return _validate_identifier(stripped, label="Action key") if stripped else ""

    @field_validator("thinking_mode", mode="before")
    @classmethod
    def normalize_thinking_mode(cls, value: Any) -> str:
        return normalize_thinking_level(value)


class NodeSystemBatchSubgraphWorkerConfig(BaseModel):
    graph: "NodeSystemGraphCore"
    template_id: str = Field(default="", alias="templateId")
    template_source: str = Field(default="", alias="templateSource")
    label: str = ""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class NodeSystemBatchDefaultWorkerSnapshot(BaseModel):
    default_worker: NodeSystemAgentConfig = Field(default_factory=NodeSystemAgentConfig, alias="defaultWorker")
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    input_modes: dict[str, BatchInputMode] = Field(default_factory=dict, alias="inputModes")
    state_schema: dict[str, NodeSystemStateDefinition] = Field(default_factory=dict, alias="stateSchema")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class NodeSystemBatchConfig(BaseModel):
    worker_source: BatchWorkerSource = Field(default=BatchWorkerSource.DEFAULT_LLM, alias="workerSource")
    input_modes: dict[str, BatchInputMode] = Field(default_factory=dict, alias="inputModes")
    max_concurrency: int = Field(default=4, ge=1, le=16, alias="maxConcurrency")
    retry_count: int = Field(default=3, ge=0, le=10, alias="retryCount")
    continue_on_error: bool = Field(default=True, alias="continueOnError")
    default_worker: NodeSystemAgentConfig = Field(default_factory=NodeSystemAgentConfig, alias="defaultWorker")
    default_worker_snapshot: NodeSystemBatchDefaultWorkerSnapshot | None = Field(default=None, alias="defaultWorkerSnapshot")
    subgraph_worker: NodeSystemBatchSubgraphWorkerConfig | None = Field(default=None, alias="subgraphWorker")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @field_validator("input_modes")
    @classmethod
    def validate_input_mode_state_keys(cls, value: dict[str, BatchInputMode]) -> dict[str, BatchInputMode]:
        return {
            _validate_identifier(state_key, label="Batch input state"): mode
            for state_key, mode in value.items()
        }


class NodeSystemConditionRule(BaseModel):
    source: str = Field(..., min_length=1)
    operator: ConditionOperator = ConditionOperator.EXISTS
    value: str | int | float | bool | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class NodeSystemConditionConfig(BaseModel):
    branches: list[str] = Field(default_factory=_fixed_condition_branches)
    loop_limit: int = Field(default=CONDITION_LOOP_LIMIT_DEFAULT, alias="loopLimit")
    branch_mapping: dict[str, str] = Field(default_factory=_fixed_condition_branch_mapping, alias="branchMapping")
    rule: NodeSystemConditionRule = Field(
        default_factory=lambda: NodeSystemConditionRule(source="result", operator=ConditionOperator.EXISTS, value=None)
    )

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

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
        for branch in value:
            next_branch = _validate_identifier(branch, label="Condition branch")
            normalized.append(next_branch)
        if normalized != list(FIXED_CONDITION_BRANCHES):
            raise ValueError("Condition branches are fixed to true, false, exhausted.")
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
        if normalized != FIXED_CONDITION_BRANCH_MAPPING:
            raise ValueError("Condition branchMapping is fixed to {'true': 'true', 'false': 'false'}.")
        return normalized

    @field_validator("loop_limit")
    @classmethod
    def validate_loop_limit(cls, value: int) -> int:
        if value < CONDITION_LOOP_LIMIT_MIN:
            raise ValueError(f"Condition loopLimit must be at least {CONDITION_LOOP_LIMIT_MIN}.")
        if value > CONDITION_LOOP_LIMIT_MAX:
            raise ValueError(f"Condition loopLimit cannot exceed {CONDITION_LOOP_LIMIT_MAX}.")
        return value


class NodeSystemOutputConfig(BaseModel):
    display_mode: DisplayMode = Field(default=DisplayMode.AUTO, alias="displayMode")
    persist_enabled: bool = Field(default=False, alias="persistEnabled")
    persist_format: PersistFormat = Field(default=PersistFormat.AUTO, alias="persistFormat")
    file_name_template: str = Field(default="", alias="fileNameTemplate")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class NodeSystemSubgraphConfig(BaseModel):
    graph: "NodeSystemGraphCore"

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class NodeSystemToolConfig(BaseModel):
    tool_key: str = Field(default="", alias="toolKey")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def reject_action_or_skill_protocol_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for legacy_field in ("skillKey", "actionKey"):
                if legacy_field in data:
                    raise ValueError(f"'{legacy_field}' is not supported for tool config. Use 'toolKey' instead.")
        return data

    @field_validator("tool_key")
    @classmethod
    def validate_optional_tool_key(cls, value: str) -> str:
        stripped = value.strip()
        return _validate_identifier(stripped, label="Tool key") if stripped else ""


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


class NodeSystemBatchNode(BaseModel):
    kind: Literal["batch"] = "batch"
    name: str = ""
    description: str = ""
    ui: NodeSystemNodeUi
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    config: NodeSystemBatchConfig = Field(default_factory=NodeSystemBatchConfig)


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


class NodeSystemSubgraphNode(BaseModel):
    kind: Literal["subgraph"] = "subgraph"
    name: str = ""
    description: str = ""
    ui: NodeSystemNodeUi
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    config: NodeSystemSubgraphConfig


class NodeSystemToolNode(BaseModel):
    kind: Literal["tool"] = "tool"
    name: str = ""
    description: str = ""
    ui: NodeSystemNodeUi
    reads: list[NodeSystemReadBinding] = Field(default_factory=list)
    writes: list[NodeSystemWriteBinding] = Field(default_factory=list)
    config: NodeSystemToolConfig = Field(default_factory=NodeSystemToolConfig)


NodeSystemNode = (
    NodeSystemInputNode
    | NodeSystemAgentNode
    | NodeSystemBatchNode
    | NodeSystemConditionNode
    | NodeSystemOutputNode
    | NodeSystemSubgraphNode
    | NodeSystemToolNode
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
    status: NodeSystemCatalogStatus = NodeSystemCatalogStatus.ACTIVE

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
    status: NodeSystemCatalogStatus = NodeSystemCatalogStatus.ACTIVE


NodeSystemBatchSubgraphWorkerConfig.model_rebuild()
NodeSystemSubgraphConfig.model_rebuild()

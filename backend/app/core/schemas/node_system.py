from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.schemas.graph import Position, StateField


class ValueType(str, Enum):
    TEXT = "text"
    JSON = "json"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"
    FILE = "file"
    KNOWLEDGE_BASE = "knowledge_base"
    ANY = "any"


class SkillUsage(str, Enum):
    REQUIRED = "required"
    OPTIONAL = "optional"


class AgentModelSource(str, Enum):
    GLOBAL = "global"
    OVERRIDE = "override"


class AgentThinkingMode(str, Enum):
    INHERIT = "inherit"
    OFF = "off"
    ON = "on"


class ConditionOperator(str, Enum):
    EQ = "=="
    NE = "!="
    GTE = ">="
    LTE = "<="
    GT = ">"
    LT = "<"
    EXISTS = "exists"


class ConditionMode(str, Enum):
    RULE = "rule"
    MODEL = "model"


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


class PortDefinition(BaseModel):
    key: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    value_type: ValueType = Field(alias="valueType")
    required: bool = False

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillAttachment(BaseModel):
    name: str = Field(..., min_length=1)
    skill_key: str = Field(..., alias="skillKey", min_length=1)
    input_mapping: dict[str, str] = Field(default_factory=dict, alias="inputMapping")
    context_binding: dict[str, str] = Field(default_factory=dict, alias="contextBinding")
    usage: SkillUsage = SkillUsage.OPTIONAL

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class InputBoundaryNodeConfig(BaseModel):
    preset_id: str = Field(..., alias="presetId", min_length=1)
    label: str = Field(..., min_length=1)
    description: str = ""
    family: Literal["input"] = "input"
    value_type: ValueType = Field(alias="valueType")
    output: PortDefinition
    default_value: str = Field(default="", alias="defaultValue")
    placeholder: str = ""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class AgentNodeConfig(BaseModel):
    preset_id: str = Field(..., alias="presetId", min_length=1)
    label: str = Field(..., min_length=1)
    description: str = ""
    family: Literal["agent"] = "agent"
    inputs: list[PortDefinition] = Field(default_factory=list)
    outputs: list[PortDefinition] = Field(default_factory=list)
    system_instruction: str = Field(default="", alias="systemInstruction")
    task_instruction: str = Field(default="", alias="taskInstruction")
    skills: list[SkillAttachment] = Field(default_factory=list)
    output_binding: dict[str, str] = Field(default_factory=dict, alias="outputBinding")
    model_source: AgentModelSource = Field(default=AgentModelSource.GLOBAL, alias="modelSource")
    model: str = ""
    thinking_mode: AgentThinkingMode = Field(default=AgentThinkingMode.ON, alias="thinkingMode")
    temperature: float = Field(default=0.2, ge=0, le=2)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class ConditionRule(BaseModel):
    source: str = Field(..., min_length=1)
    operator: ConditionOperator
    value: str | int | float | bool | None = None

    model_config = ConfigDict(str_strip_whitespace=True)


class BranchDefinition(BaseModel):
    key: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class ConditionNodeConfig(BaseModel):
    preset_id: str = Field(..., alias="presetId", min_length=1)
    label: str = Field(..., min_length=1)
    description: str = ""
    family: Literal["condition"] = "condition"
    inputs: list[PortDefinition] = Field(default_factory=list)
    branches: list[BranchDefinition] = Field(default_factory=list)
    condition_mode: ConditionMode = Field(default=ConditionMode.RULE, alias="conditionMode")
    rule: ConditionRule
    branch_mapping: dict[str, str] = Field(default_factory=dict, alias="branchMapping")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class OutputBoundaryNodeConfig(BaseModel):
    preset_id: str = Field(..., alias="presetId", min_length=1)
    label: str = Field(..., min_length=1)
    description: str = ""
    family: Literal["output"] = "output"
    input: PortDefinition
    display_mode: DisplayMode = Field(default=DisplayMode.AUTO, alias="displayMode")
    persist_enabled: bool = Field(default=False, alias="persistEnabled")
    persist_format: PersistFormat = Field(default=PersistFormat.AUTO, alias="persistFormat")
    file_name_template: str = Field(default="", alias="fileNameTemplate")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


NodeSystemNodeConfig = (
    InputBoundaryNodeConfig
    | AgentNodeConfig
    | ConditionNodeConfig
    | OutputBoundaryNodeConfig
)


class NodeViewportSize(BaseModel):
    width: float | None = None
    height: float | None = None

    model_config = ConfigDict(extra="ignore")


class NodeSystemNodeData(BaseModel):
    node_id: str = Field(alias="nodeId", min_length=1)
    config: NodeSystemNodeConfig = Field(discriminator="family")
    preview_text: str = Field(default="", alias="previewText")
    is_expanded: bool = Field(default=False, alias="isExpanded")
    collapsed_size: NodeViewportSize | None = Field(default=None, alias="collapsedSize")
    expanded_size: NodeViewportSize | None = Field(default=None, alias="expandedSize")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class NodeSystemGraphNode(BaseModel):
    id: str = Field(..., min_length=1)
    type: str = "default"
    position: Position
    data: NodeSystemNodeData

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore")

    @model_validator(mode="after")
    def sync_embedded_node_id(self) -> "NodeSystemGraphNode":
        if self.data.node_id != self.id:
            self.data.node_id = self.id
        return self


class NodeSystemGraphEdge(BaseModel):
    id: str = Field(..., min_length=1)
    source: str = Field(..., min_length=1)
    target: str = Field(..., min_length=1)
    source_handle: str | None = Field(default=None, alias="sourceHandle")
    target_handle: str | None = Field(default=None, alias="targetHandle")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="ignore")


class NodeSystemGraphPayload(BaseModel):
    graph_family: Literal["node_system"] = "node_system"
    graph_id: str | None = None
    name: str = Field(..., min_length=1)
    template_id: str = ""
    theme_config: dict[str, Any] = Field(default_factory=dict)
    state_schema: list[StateField] = Field(default_factory=list)
    nodes: list[NodeSystemGraphNode] = Field(default_factory=list)
    edges: list[NodeSystemGraphEdge] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Graph name cannot be empty.")
        return value


class NodeSystemGraphDocument(NodeSystemGraphPayload):
    graph_id: str = Field(..., min_length=1)

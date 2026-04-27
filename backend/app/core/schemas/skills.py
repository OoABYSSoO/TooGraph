from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class SkillSideEffect(str, Enum):
    NONE = "none"
    NETWORK = "network"
    KNOWLEDGE_READ = "knowledge_read"
    MODEL_CALL = "model_call"
    FILE_READ = "file_read"
    FILE_WRITE = "file_write"
    SUBPROCESS = "subprocess"
    SECRET_READ = "secret_read"


class SkillSourceFormat(str, Enum):
    GRAPHITE = "graphite_definition"
    CLAUDE_CODE = "claude_code"
    OPENCLAW = "openclaw"
    CODEX = "codex"


class SkillSourceScope(str, Enum):
    GRAPHITE_MANAGED = "graphite_managed"
    EXTERNAL = "external"


class SkillTarget(str, Enum):
    AGENT_NODE = "agent_node"
    COMPANION = "companion"


class SkillKind(str, Enum):
    ATOMIC = "atomic"
    WORKFLOW = "workflow"
    TOOL = "tool"
    CONTEXT = "context"
    PROFILE = "profile"
    ADAPTER = "adapter"
    CONTROL = "control"


class SkillMode(str, Enum):
    TOOL = "tool"
    WORKFLOW = "workflow"
    CONTEXT = "context"


class SkillScope(str, Enum):
    NODE = "node"
    GRAPH = "graph"
    WORKSPACE = "workspace"
    GLOBAL = "global"


class SkillCompatibilityStatus(str, Enum):
    NATIVE = "native"
    PARTIAL = "partial"
    INCOMPATIBLE = "incompatible"


class SkillCompatibilityTarget(str, Enum):
    CLAUDE_CODE = "claude_code"
    OPENCLAW = "openclaw"
    CODEX = "codex"


class SkillCompatibilityReport(BaseModel):
    target: SkillCompatibilityTarget
    status: SkillCompatibilityStatus
    summary: str
    missing_capabilities: list[str] = Field(default_factory=list, alias="missingCapabilities")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillCatalogStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


class SkillIoField(BaseModel):
    key: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    value_type: str = Field(..., alias="valueType", min_length=1)
    required: bool = False
    description: str = ""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillDefinition(BaseModel):
    skill_key: str = Field(..., min_length=1, alias="skillKey")
    label: str = Field(..., min_length=1)
    description: str = ""
    version: str = ""
    targets: list[SkillTarget] = Field(default_factory=lambda: [SkillTarget.AGENT_NODE])
    kind: SkillKind = SkillKind.ATOMIC
    mode: SkillMode = SkillMode.TOOL
    scope: SkillScope = SkillScope.NODE
    permissions: list[str] = Field(default_factory=list)
    input_schema: list[SkillIoField] = Field(default_factory=list, alias="inputSchema")
    output_schema: list[SkillIoField] = Field(default_factory=list, alias="outputSchema")
    supported_value_types: list[str] = Field(default_factory=list, alias="supportedValueTypes")
    side_effects: list[SkillSideEffect] = Field(default_factory=list, alias="sideEffects")
    source_format: SkillSourceFormat = Field(default=SkillSourceFormat.GRAPHITE, alias="sourceFormat")
    source_scope: SkillSourceScope = Field(default=SkillSourceScope.GRAPHITE_MANAGED, alias="sourceScope")
    source_path: str = Field(default="", alias="sourcePath")
    runtime_ready: bool = Field(default=False, alias="runtimeReady")
    runtime_registered: bool = Field(default=False, alias="runtimeRegistered")
    configured: bool = True
    healthy: bool = True
    status: SkillCatalogStatus = Field(default=SkillCatalogStatus.ACTIVE)
    can_manage: bool = Field(default=False, alias="canManage")
    can_import: bool = Field(default=False, alias="canImport")
    compatibility: list[SkillCompatibilityReport] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

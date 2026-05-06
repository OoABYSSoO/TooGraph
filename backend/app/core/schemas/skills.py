from __future__ import annotations

from enum import Enum
from typing import Literal

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
    BROWSER_AUTOMATION = "browser_automation"


class SkillSourceFormat(str, Enum):
    SKILL = "skill"


class SkillSourceScope(str, Enum):
    INSTALLED = "installed"


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


class SkillAgentNodeEligibility(str, Enum):
    READY = "ready"
    NEEDS_MANIFEST = "needs_manifest"
    INCOMPATIBLE = "incompatible"


class SkillCatalogStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


class SkillIoField(BaseModel):
    key: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    value_type: str = Field(..., alias="valueType", min_length=1)
    required: bool = False
    description: str = ""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class SkillRuntimeSpec(BaseModel):
    type: str = "none"
    entrypoint: str = ""
    command: list[str] = Field(default_factory=list)
    timeout_seconds: float = Field(default=30.0, alias="timeoutSeconds")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillHealthSpec(BaseModel):
    type: str = "none"

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillRunPolicy(BaseModel):
    discoverable: bool = True
    auto_selectable: bool = Field(default=False, alias="autoSelectable")
    requires_approval: bool = Field(default=False, alias="requiresApproval")

    model_config = ConfigDict(populate_by_name=True)


class SkillRunPolicies(BaseModel):
    default: SkillRunPolicy = Field(default_factory=SkillRunPolicy)
    origins: dict[str, SkillRunPolicy] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillDefinition(BaseModel):
    skill_key: str = Field(..., min_length=1, alias="skillKey")
    name: str = Field(..., min_length=1)
    description: str = ""
    agent_instruction: str = Field(default="", alias="agentInstruction")
    schema_version: str = Field(default="", alias="schemaVersion")
    version: str = ""
    run_policies: SkillRunPolicies = Field(default_factory=SkillRunPolicies, alias="runPolicies")
    kind: SkillKind = SkillKind.ATOMIC
    mode: SkillMode = SkillMode.TOOL
    scope: SkillScope = SkillScope.NODE
    permissions: list[str] = Field(default_factory=list)
    runtime: SkillRuntimeSpec = Field(default_factory=SkillRuntimeSpec)
    health: SkillHealthSpec = Field(default_factory=SkillHealthSpec)
    input_schema: list[SkillIoField] = Field(default_factory=list, alias="inputSchema")
    output_schema: list[SkillIoField] = Field(default_factory=list, alias="outputSchema")
    supported_value_types: list[str] = Field(default_factory=list, alias="supportedValueTypes")
    side_effects: list[SkillSideEffect] = Field(default_factory=list, alias="sideEffects")
    agent_node_eligibility: SkillAgentNodeEligibility = Field(
        default=SkillAgentNodeEligibility.NEEDS_MANIFEST,
        alias="agentNodeEligibility",
    )
    agent_node_blockers: list[str] = Field(default_factory=list, alias="agentNodeBlockers")
    source_format: SkillSourceFormat = Field(default=SkillSourceFormat.SKILL, alias="sourceFormat")
    source_scope: SkillSourceScope = Field(default=SkillSourceScope.INSTALLED, alias="sourceScope")
    source_path: str = Field(default="", alias="sourcePath")
    runtime_ready: bool = Field(default=False, alias="runtimeReady")
    runtime_registered: bool = Field(default=False, alias="runtimeRegistered")
    configured: bool = True
    healthy: bool = True
    status: SkillCatalogStatus = Field(default=SkillCatalogStatus.ACTIVE)
    can_manage: bool = Field(default=False, alias="canManage")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillFileNode(BaseModel):
    name: str
    path: str
    type: Literal["directory", "file"]
    size: int = 0
    language: str = ""
    previewable: bool = False
    executable: bool = False
    children: list["SkillFileNode"] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillFileTreeResponse(BaseModel):
    skill_key: str = Field(..., alias="skillKey")
    root: SkillFileNode

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillFileContentResponse(BaseModel):
    skill_key: str = Field(..., alias="skillKey")
    path: str
    name: str
    size: int
    language: str = ""
    previewable: bool = False
    executable: bool = False
    encoding: Literal["utf-8", "binary", "too_large"]
    content: str | None = None

    model_config = ConfigDict(populate_by_name=True)

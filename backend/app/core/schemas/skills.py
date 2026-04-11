from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SkillSourceScope(str, Enum):
    INSTALLED = "installed"
    OFFICIAL = "official"
    USER = "user"


class SkillLlmNodeEligibility(str, Enum):
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


class SkillCapabilityPolicy(BaseModel):
    selectable: bool = True
    requires_approval: bool = Field(default=False, alias="requiresApproval")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class SkillCapabilityPolicies(BaseModel):
    default: SkillCapabilityPolicy = Field(default_factory=SkillCapabilityPolicy)
    origins: dict[str, SkillCapabilityPolicy] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class SkillDefinition(BaseModel):
    skill_key: str = Field(..., min_length=1, alias="skillKey")
    name: str = Field(..., min_length=1)
    description: str = ""
    llm_instruction: str = Field(default="", alias="llmInstruction")
    schema_version: str = Field(default="", alias="schemaVersion")
    version: str = ""
    capability_policy: SkillCapabilityPolicies = Field(
        default_factory=SkillCapabilityPolicies,
        alias="capabilityPolicy",
    )
    permissions: list[str] = Field(default_factory=list)
    runtime: SkillRuntimeSpec = Field(default_factory=SkillRuntimeSpec)
    input_schema: list[SkillIoField] = Field(default_factory=list, alias="inputSchema")
    output_schema: list[SkillIoField] = Field(default_factory=list, alias="outputSchema")
    llm_node_eligibility: SkillLlmNodeEligibility = Field(
        default=SkillLlmNodeEligibility.NEEDS_MANIFEST,
        alias="llmNodeEligibility",
    )
    llm_node_blockers: list[str] = Field(default_factory=list, alias="llmNodeBlockers")
    source_scope: SkillSourceScope = Field(default=SkillSourceScope.INSTALLED, alias="sourceScope")
    source_path: str = Field(default="", alias="sourcePath")
    runtime_ready: bool = Field(default=False, alias="runtimeReady")
    runtime_registered: bool = Field(default=False, alias="runtimeRegistered")
    status: SkillCatalogStatus = Field(default=SkillCatalogStatus.ACTIVE)
    can_manage: bool = Field(default=False, alias="canManage")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SkillSettingsUpdate(BaseModel):
    capability_policy: SkillCapabilityPolicies = Field(..., alias="capabilityPolicy")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


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

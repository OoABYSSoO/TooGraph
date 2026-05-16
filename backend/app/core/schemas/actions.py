from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ActionSourceScope(str, Enum):
    INSTALLED = "installed"
    OFFICIAL = "official"
    USER = "user"


class ActionLlmNodeEligibility(str, Enum):
    READY = "ready"
    NEEDS_MANIFEST = "needs_manifest"
    INCOMPATIBLE = "incompatible"


class ActionCatalogStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


class ActionIoField(BaseModel):
    key: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    value_type: str = Field(..., alias="valueType", min_length=1)
    description: str = ""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class ActionRuntimeSpec(BaseModel):
    type: str = "none"
    entrypoint: str = ""
    command: list[str] = Field(default_factory=list)
    timeout_seconds: float = Field(default=30.0, alias="timeoutSeconds")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class ActionCapabilityPolicy(BaseModel):
    selectable: bool = True
    requires_approval: bool = Field(default=False, alias="requiresApproval")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class ActionCapabilityPolicies(BaseModel):
    default: ActionCapabilityPolicy = Field(default_factory=ActionCapabilityPolicy)
    origins: dict[str, ActionCapabilityPolicy] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class ActionDefinition(BaseModel):
    action_key: str = Field(..., min_length=1, alias="actionKey")
    name: str = Field(..., min_length=1)
    description: str = ""
    llm_instruction: str = Field(default="", alias="llmInstruction")
    schema_version: str = Field(default="", alias="schemaVersion")
    version: str = ""
    capability_policy: ActionCapabilityPolicies = Field(
        default_factory=ActionCapabilityPolicies,
        alias="capabilityPolicy",
    )
    permissions: list[str] = Field(default_factory=list)
    runtime: ActionRuntimeSpec = Field(default_factory=ActionRuntimeSpec)
    state_input_schema: list[ActionIoField] = Field(default_factory=list, alias="stateInputSchema")
    llm_output_schema: list[ActionIoField] = Field(default_factory=list, alias="llmOutputSchema")
    state_output_schema: list[ActionIoField] = Field(default_factory=list, alias="stateOutputSchema")
    llm_node_eligibility: ActionLlmNodeEligibility = Field(
        default=ActionLlmNodeEligibility.NEEDS_MANIFEST,
        alias="llmNodeEligibility",
    )
    llm_node_blockers: list[str] = Field(default_factory=list, alias="llmNodeBlockers")
    source_scope: ActionSourceScope = Field(default=ActionSourceScope.INSTALLED, alias="sourceScope")
    source_path: str = Field(default="", alias="sourcePath")
    runtime_ready: bool = Field(default=False, alias="runtimeReady")
    runtime_registered: bool = Field(default=False, alias="runtimeRegistered")
    status: ActionCatalogStatus = Field(default=ActionCatalogStatus.ACTIVE)
    can_manage: bool = Field(default=False, alias="canManage")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def reject_legacy_action_key_alias(cls, data: Any) -> Any:
        if isinstance(data, dict) and ("skillKey" in data or "skill_key" in data):
            raise ValueError("'skillKey' is no longer supported for Action definitions. Use 'actionKey' instead.")
        return data


class ActionSettingsUpdate(BaseModel):
    capability_policy: ActionCapabilityPolicies = Field(..., alias="capabilityPolicy")

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class ActionFileNode(BaseModel):
    name: str
    path: str
    type: Literal["directory", "file"]
    size: int = 0
    language: str = ""
    previewable: bool = False
    executable: bool = False
    children: list["ActionFileNode"] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class ActionFileTreeResponse(BaseModel):
    action_key: str = Field(..., alias="actionKey")
    root: ActionFileNode

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class ActionFileContentResponse(BaseModel):
    action_key: str = Field(..., alias="actionKey")
    path: str
    name: str
    size: int
    language: str = ""
    previewable: bool = False
    executable: bool = False
    encoding: Literal["utf-8", "binary", "too_large"]
    content: str | None = None

    model_config = ConfigDict(populate_by_name=True)

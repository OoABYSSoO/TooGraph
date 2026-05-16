from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ToolSourceScope(str, Enum):
    INSTALLED = "installed"
    OFFICIAL = "official"
    USER = "user"


class ToolCatalogStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DELETED = "deleted"


class ToolIoField(BaseModel):
    key: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    value_type: str = Field(..., alias="valueType", min_length=1)
    description: str = ""

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True, extra="forbid")


class ToolRuntimeSpec(BaseModel):
    type: str = "none"
    entrypoint: str = ""
    command: list[str] = Field(default_factory=list)
    timeout_seconds: float = Field(default=30.0, alias="timeoutSeconds")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class ToolDefinition(BaseModel):
    tool_key: str = Field(..., min_length=1, alias="toolKey")
    name: str = Field(..., min_length=1)
    description: str = ""
    schema_version: str = Field(default="", alias="schemaVersion")
    version: str = ""
    permissions: list[str] = Field(default_factory=list)
    runtime: ToolRuntimeSpec = Field(default_factory=ToolRuntimeSpec)
    input_schema: list[ToolIoField] = Field(default_factory=list, alias="inputSchema")
    output_schema: list[ToolIoField] = Field(default_factory=list, alias="outputSchema")
    source_scope: ToolSourceScope = Field(default=ToolSourceScope.INSTALLED, alias="sourceScope")
    source_path: str = Field(default="", alias="sourcePath")
    runtime_ready: bool = Field(default=False, alias="runtimeReady")
    runtime_registered: bool = Field(default=False, alias="runtimeRegistered")
    status: ToolCatalogStatus = Field(default=ToolCatalogStatus.ACTIVE)
    can_manage: bool = Field(default=False, alias="canManage")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @model_validator(mode="before")
    @classmethod
    def reject_action_or_skill_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        legacy_fields = {
            "skillKey": "toolKey",
            "skill_key": "tool_key",
            "actionKey": "toolKey",
            "action_key": "tool_key",
            "llmInstruction": "description",
            "llm_instruction": "description",
            "llmOutputSchema": "inputSchema",
            "llm_output_schema": "input_schema",
            "stateInputSchema": "inputSchema",
            "state_input_schema": "input_schema",
            "stateOutputSchema": "outputSchema",
            "state_output_schema": "output_schema",
        }
        for legacy, replacement in legacy_fields.items():
            if legacy in data:
                raise ValueError(f"Tool manifest field '{legacy}' is not supported. Use '{replacement}' instead.")
        return data

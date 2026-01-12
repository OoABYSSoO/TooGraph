from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class SkillSideEffect(str, Enum):
    NONE = "none"
    NETWORK = "network"
    KNOWLEDGE_READ = "knowledge_read"
    MODEL_CALL = "model_call"
    FILE_READ = "file_read"


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
    input_schema: list[SkillIoField] = Field(default_factory=list, alias="inputSchema")
    output_schema: list[SkillIoField] = Field(default_factory=list, alias="outputSchema")
    supported_value_types: list[str] = Field(default_factory=list, alias="supportedValueTypes")
    side_effects: list[SkillSideEffect] = Field(default_factory=list, alias="sideEffects")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

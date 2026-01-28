from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas.node_system import NodeSystemNodeConfig


class NodeSystemPresetPayload(BaseModel):
    preset_id: str = Field(..., alias="presetId", min_length=1)
    source_preset_id: str | None = Field(default=None, alias="sourcePresetId")
    definition: NodeSystemNodeConfig = Field(discriminator="family")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class NodeSystemPresetDocument(NodeSystemPresetPayload):
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

    @model_validator(mode="after")
    def ensure_definition_preset_id(self) -> "NodeSystemPresetDocument":
        self.definition.preset_id = self.preset_id
        return self


class NodeSystemPresetListItem(BaseModel):
    preset_id: str = Field(..., alias="presetId")
    source_preset_id: str | None = Field(default=None, alias="sourcePresetId")
    label: str
    description: str = ""
    family: str
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)


class NodeSystemPresetSaveResponse(BaseModel):
    preset_id: str = Field(..., alias="presetId")
    saved: bool = True
    updated_at: str | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas.node_system import NodeSystemNode, NodeSystemStateDefinition


class NodeSystemPresetDefinition(BaseModel):
    label: str = ""
    description: str = ""
    state_schema: dict[str, NodeSystemStateDefinition] = Field(default_factory=dict)
    node: NodeSystemNode

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class NodeSystemPresetPayload(BaseModel):
    preset_id: str = Field(..., alias="presetId", min_length=1)
    source_preset_id: str | None = Field(default=None, alias="sourcePresetId")
    definition: NodeSystemPresetDefinition

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class NodeSystemPresetDocument(NodeSystemPresetPayload):
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")


class NodeSystemPresetListItem(BaseModel):
    preset_id: str = Field(..., alias="presetId")
    source_preset_id: str | None = Field(default=None, alias="sourcePresetId")
    label: str
    family: str
    created_at: str | None = Field(default=None, alias="createdAt")
    updated_at: str | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)


class NodeSystemPresetSaveResponse(BaseModel):
    preset_id: str = Field(..., alias="presetId")
    saved: bool = True
    updated_at: str | None = Field(default=None, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)

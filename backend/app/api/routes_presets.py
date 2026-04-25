from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.schemas.preset import (
    NodeSystemPresetDocument,
    NodeSystemPresetPayload,
    NodeSystemPresetSaveResponse,
)
from app.core.storage.preset_store import delete_preset, disable_preset, enable_preset, list_presets, load_preset, save_preset


router = APIRouter(prefix="/api/presets", tags=["presets"])


@router.get("", response_model=list[NodeSystemPresetDocument])
def list_presets_endpoint(include_disabled: bool = False) -> list[NodeSystemPresetDocument]:
    return list_presets(include_disabled=include_disabled)


@router.get("/{preset_id}", response_model=NodeSystemPresetDocument)
def get_preset_endpoint(preset_id: str) -> NodeSystemPresetDocument:
    try:
        return load_preset(preset_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("", response_model=NodeSystemPresetSaveResponse)
def create_preset_endpoint(payload: NodeSystemPresetPayload) -> NodeSystemPresetSaveResponse:
    document = save_preset(payload)
    return NodeSystemPresetSaveResponse(presetId=document.preset_id, updatedAt=document.updated_at)


@router.put("/{preset_id}", response_model=NodeSystemPresetSaveResponse)
def update_preset_endpoint(preset_id: str, payload: NodeSystemPresetPayload) -> NodeSystemPresetSaveResponse:
    if preset_id != payload.preset_id:
        raise HTTPException(status_code=400, detail="Preset id in path must match payload presetId.")
    document = save_preset(payload)
    return NodeSystemPresetSaveResponse(presetId=document.preset_id, updatedAt=document.updated_at)


@router.post("/{preset_id}/disable", response_model=NodeSystemPresetDocument)
def disable_preset_endpoint(preset_id: str) -> NodeSystemPresetDocument:
    try:
        return disable_preset(preset_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{preset_id}/enable", response_model=NodeSystemPresetDocument)
def enable_preset_endpoint(preset_id: str) -> NodeSystemPresetDocument:
    try:
        return enable_preset(preset_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{preset_id}")
def delete_preset_endpoint(preset_id: str) -> dict[str, str]:
    try:
        delete_preset(preset_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"presetId": preset_id, "status": "deleted"}

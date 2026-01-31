from __future__ import annotations

from app.core.schemas.preset import NodeSystemPresetDocument, NodeSystemPresetPayload
from app.core.storage.database import PRESET_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


def save_preset(payload: NodeSystemPresetPayload) -> NodeSystemPresetDocument:
    PRESET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = _preset_path(payload.preset_id)
    existing_payload = read_json_file(path, default=None)
    existing_document = NodeSystemPresetDocument.model_validate(existing_payload) if existing_payload else None
    timestamp = utc_now_iso()
    document = NodeSystemPresetDocument.model_validate(
        {
            **payload.model_dump(by_alias=True),
            "createdAt": existing_document.created_at if existing_document else timestamp,
            "updatedAt": timestamp,
        }
    )
    write_json_file(path, document.model_dump(by_alias=True))
    return document


def load_preset(preset_id: str) -> NodeSystemPresetDocument:
    PRESET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(_preset_path(preset_id), default=None)
    if payload is None:
        raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")
    return NodeSystemPresetDocument.model_validate(payload)


def list_presets() -> list[NodeSystemPresetDocument]:
    PRESET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    items: list[NodeSystemPresetDocument] = []
    for path in sorted(PRESET_DATA_DIR.glob("*.json")):
        payload = read_json_file(path, default=None)
        if payload is None:
            continue
        try:
            items.append(NodeSystemPresetDocument.model_validate(payload))
        except Exception:
            continue
    items.sort(key=lambda item: ((item.updated_at or ""), item.preset_id), reverse=True)
    return items


def _preset_path(preset_id: str):
    return PRESET_DATA_DIR / f"{preset_id}.json"

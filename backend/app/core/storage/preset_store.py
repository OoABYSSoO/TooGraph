from __future__ import annotations

from pathlib import Path

from app.core.schemas.preset import NodeSystemPresetDocument, NodeSystemPresetPayload, NodeSystemPresetStatus
from app.core.storage.database import PRESET_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


def save_preset(payload: NodeSystemPresetPayload) -> NodeSystemPresetDocument:
    if payload.definition.node.kind != "agent":
        raise ValueError("Only LLM nodes can be saved as presets.")
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
            "status": existing_document.status if existing_document else NodeSystemPresetStatus.ACTIVE,
        }
    )
    _write_preset_document(path, document)
    return document


def load_preset(preset_id: str) -> NodeSystemPresetDocument:
    PRESET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(_preset_path(preset_id), default=None)
    if payload is None:
        raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")
    return NodeSystemPresetDocument.model_validate(payload)


def list_presets(include_disabled: bool = False) -> list[NodeSystemPresetDocument]:
    PRESET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    items: list[NodeSystemPresetDocument] = []
    for path in sorted(PRESET_DATA_DIR.glob("*.json")):
        payload = read_json_file(path, default=None)
        if payload is None:
            continue
        try:
            document = NodeSystemPresetDocument.model_validate(payload)
            if document.definition.node.kind != "agent":
                continue
            if document.status == NodeSystemPresetStatus.DISABLED and not include_disabled:
                continue
            items.append(document)
        except Exception:
            continue
    items.sort(key=lambda item: ((item.updated_at or ""), item.preset_id), reverse=True)
    return items


def disable_preset(preset_id: str) -> NodeSystemPresetDocument:
    return set_preset_status(preset_id, NodeSystemPresetStatus.DISABLED)


def enable_preset(preset_id: str) -> NodeSystemPresetDocument:
    return set_preset_status(preset_id, NodeSystemPresetStatus.ACTIVE)


def set_preset_status(preset_id: str, status: NodeSystemPresetStatus) -> NodeSystemPresetDocument:
    document = load_preset(preset_id)
    updated_document = NodeSystemPresetDocument.model_validate(
        {
            **document.model_dump(by_alias=True, mode="json"),
            "status": status.value,
            "updatedAt": utc_now_iso(),
        }
    )
    _write_preset_document(_preset_path(preset_id), updated_document)
    return updated_document


def delete_preset(preset_id: str) -> None:
    path = _preset_path(preset_id)
    if not path.exists():
        raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")
    path.unlink()


def _preset_path(preset_id: str) -> Path:
    return PRESET_DATA_DIR / f"{preset_id}.json"


def _write_preset_document(path: Path, document: NodeSystemPresetDocument) -> None:
    write_json_file(path, document.model_dump(by_alias=True, mode="json"))

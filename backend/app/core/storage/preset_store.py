from __future__ import annotations

import sqlite3

from app.core.schemas.preset import NodeSystemPresetDocument, NodeSystemPresetPayload
from app.core.storage.database import PRESET_DATA_DIR, get_connection, row_payload
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


_PRESET_STORAGE_MIGRATED = False


def save_preset(payload: NodeSystemPresetPayload) -> NodeSystemPresetDocument:
    _initialize_preset_storage()
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
    _initialize_preset_storage()
    payload = read_json_file(_preset_path(preset_id), default=None)
    if payload is None:
        raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")
    return NodeSystemPresetDocument.model_validate(payload)


def list_presets() -> list[NodeSystemPresetDocument]:
    _initialize_preset_storage()
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


def _initialize_preset_storage() -> None:
    global _PRESET_STORAGE_MIGRATED
    PRESET_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if _PRESET_STORAGE_MIGRATED:
        return
    _migrate_presets_from_database()
    _PRESET_STORAGE_MIGRATED = True


def _migrate_presets_from_database() -> None:
    try:
        with get_connection() as connection:
            rows = connection.execute(
                """
                SELECT preset_id, payload_json, created_at, updated_at
                FROM presets
                ORDER BY updated_at DESC, preset_id DESC
                """
            ).fetchall()
    except sqlite3.OperationalError:
        return

    for row in rows:
        path = _preset_path(str(row["preset_id"]))
        if path.exists():
            continue
        payload = row_payload(row)
        if payload is None:
            continue
        document = NodeSystemPresetDocument.model_validate(
            {
                "presetId": row["preset_id"],
                "sourcePresetId": payload.get("sourcePresetId"),
                "definition": payload.get("definition", {}),
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
            }
        )
        write_json_file(path, document.model_dump(by_alias=True))


def _preset_path(preset_id: str):
    return PRESET_DATA_DIR / f"{preset_id}.json"

from __future__ import annotations

from app.core.schemas.preset import (
    NodeSystemPresetDocument,
    NodeSystemPresetPayload,
)
from app.core.storage.database import get_connection, row_payload


def save_preset(payload: NodeSystemPresetPayload) -> NodeSystemPresetDocument:
    document = NodeSystemPresetDocument.model_validate(payload.model_dump(by_alias=True))
    definition = document.definition or {}
    label = str(definition.get("label") or document.preset_id)
    family = str(definition.get("family") or definition.get("kind") or "unknown")
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO presets (preset_id, label, family, payload_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(preset_id) DO UPDATE SET
                label = excluded.label,
                family = excluded.family,
                payload_json = excluded.payload_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                document.preset_id,
                label,
                family,
                document.model_dump_json(by_alias=True),
            ),
        )
        connection.commit()

        row = connection.execute(
            "SELECT payload_json, created_at, updated_at FROM presets WHERE preset_id = ?",
            (document.preset_id,),
        ).fetchone()
    payload_row = row_payload(row)
    if payload_row is None:
        raise FileNotFoundError(f"Preset '{document.preset_id}' was not saved.")
    payload_row["createdAt"] = row["created_at"]
    payload_row["updatedAt"] = row["updated_at"]
    return NodeSystemPresetDocument.model_validate(payload_row)


def load_preset(preset_id: str) -> NodeSystemPresetDocument:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT payload_json, created_at, updated_at FROM presets WHERE preset_id = ?",
            (preset_id,),
        ).fetchone()
    payload = row_payload(row)
    if payload is None:
        raise FileNotFoundError(f"Preset '{preset_id}' does not exist.")
    payload["createdAt"] = row["created_at"]
    payload["updatedAt"] = row["updated_at"]
    return NodeSystemPresetDocument.model_validate(payload)


def list_presets() -> list[NodeSystemPresetDocument]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT preset_id, label, family, payload_json, created_at, updated_at
            FROM presets
            ORDER BY updated_at DESC, preset_id DESC
            """
        ).fetchall()

    items: list[NodeSystemPresetDocument] = []
    for row in rows:
        payload = row_payload(row)
        if payload is None:
            continue
        items.append(
            NodeSystemPresetDocument.model_validate(
                {
                    "presetId": row["preset_id"],
                    "sourcePresetId": payload.get("sourcePresetId"),
                    "definition": payload.get("definition", {}),
                    "createdAt": row["created_at"],
                    "updatedAt": row["updated_at"],
                }
            )
        )
    return items

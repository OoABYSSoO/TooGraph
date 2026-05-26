from __future__ import annotations

import hashlib
import json
from typing import Any

from app.core.storage.database import get_connection


INLINE_JSON_VALUE_LIMIT_BYTES = 32 * 1024


def put_content_blob(
    content: str | bytes,
    mime_type: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    content_bytes = content.encode("utf-8") if isinstance(content, str) else bytes(content)
    content_hash = _content_hash(content_bytes)
    storage_kind = "text" if isinstance(content, str) else "bytes"
    metadata_json = json.dumps(metadata or {}, ensure_ascii=False, sort_keys=True)

    with get_connection() as connection:
        connection.execute(
            """
            INSERT OR IGNORE INTO content_blobs (
                content_hash,
                storage_kind,
                mime_type,
                byte_length,
                content_text,
                content_bytes,
                metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                content_hash,
                storage_kind,
                mime_type,
                len(content_bytes),
                content if isinstance(content, str) else None,
                content_bytes if isinstance(content, bytes) else None,
                metadata_json,
            ),
        )
        row = connection.execute(
            "SELECT * FROM content_blobs WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()

    return _row_to_dict(row)


def get_content_blob(content_hash: str) -> dict[str, Any]:
    normalized_hash = str(content_hash or "").strip()
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM content_blobs WHERE content_hash = ?",
            (normalized_hash,),
        ).fetchone()
    if row is None:
        raise FileNotFoundError(f"Content blob '{normalized_hash}' does not exist.")
    return _row_to_dict(row)


def maybe_inline_or_ref(value: Any, mime_type: str = "application/json") -> Any:
    payload = _serialize_value(value)
    payload_bytes = payload.encode("utf-8")
    if len(payload_bytes) <= INLINE_JSON_VALUE_LIMIT_BYTES:
        return value
    blob = put_content_blob(payload, mime_type, {"encoding": "json"})
    return {
        "kind": "content_ref",
        "content_hash": blob["content_hash"],
        "mime_type": mime_type,
        "byte_length": blob["byte_length"],
    }


def _serialize_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _content_hash(content: bytes) -> str:
    return f"sha256:{hashlib.sha256(content).hexdigest()}"


def _row_to_dict(row: Any) -> dict[str, Any]:
    if row is None:
        raise FileNotFoundError("Content blob does not exist.")
    payload = dict(row)
    metadata_json = payload.get("metadata_json")
    if isinstance(metadata_json, str):
        try:
            payload["metadata"] = json.loads(metadata_json)
        except json.JSONDecodeError:
            payload["metadata"] = {}
    else:
        payload["metadata"] = {}
    return payload

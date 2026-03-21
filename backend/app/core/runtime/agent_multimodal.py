from __future__ import annotations

import json
from typing import Any

from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType


def normalize_uploaded_file_envelope(value: Any) -> dict[str, Any] | None:
    if isinstance(value, dict) and value.get("kind") == "uploaded_file":
        return value
    if isinstance(value, str):
        trimmed = value.strip()
        if not trimmed.startswith("{"):
            return None
        try:
            parsed = json.loads(trimmed)
        except json.JSONDecodeError:
            return None
        if isinstance(parsed, dict) and parsed.get("kind") == "uploaded_file":
            return parsed
    return None


def summarize_data_url(url: str) -> str:
    head, _sep, _tail = url.partition(",")
    mime_type = "unknown"
    if head.startswith("data:"):
        mime_type = head[5:].split(";", 1)[0] or "unknown"
    return f"<data-url mime={mime_type} chars={len(url)}>"


def collect_input_attachments(
    input_values: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> list[dict[str, Any]]:
    attachments: list[dict[str, Any]] = []
    schema = state_schema or {}
    for state_key, value in input_values.items():
        definition = schema.get(state_key)
        attachment = _build_media_attachment(state_key, value, definition)
        if attachment is not None:
            attachments.append(attachment)
    return attachments


def _build_media_attachment(
    state_key: str,
    value: Any,
    definition: NodeSystemStateDefinition | None,
) -> dict[str, Any] | None:
    envelope = normalize_uploaded_file_envelope(value)
    state_type = definition.type if definition is not None else None
    expected_type = _expected_media_type(state_type, envelope)
    if expected_type not in {"image", "video"}:
        return None
    data_url = _extract_media_data_url(value, envelope, expected_type)
    if not data_url:
        return None

    name = str(envelope.get("name") if envelope else "").strip()
    mime_type = str(envelope.get("mimeType") or envelope.get("mime_type") if envelope else "").strip()
    if not mime_type:
        mime_type = _extract_data_url_mime_type(data_url)
    if not name and definition is not None:
        name = definition.name.strip()

    return {
        "type": expected_type,
        "state_key": state_key,
        "name": name,
        "mime_type": mime_type,
        "data_url": data_url,
    }


def _expected_media_type(
    state_type: NodeSystemStateType | None,
    envelope: dict[str, Any] | None,
) -> str:
    if state_type == NodeSystemStateType.IMAGE:
        return "image"
    if state_type == NodeSystemStateType.VIDEO:
        return "video"
    if envelope is None:
        return ""
    detected_type = str(envelope.get("detectedType") if envelope else "").strip().lower()
    return detected_type if detected_type in {"image", "video"} else ""


def _extract_media_data_url(value: Any, envelope: dict[str, Any] | None, media_type: str) -> str:
    prefix = f"data:{media_type}/"
    if isinstance(value, str) and value.startswith(prefix):
        return value
    if envelope is None:
        return ""
    content = envelope.get("content")
    if not isinstance(content, str):
        return ""
    if str(envelope.get("encoding") or "").strip() != "data_url":
        return ""
    if not content.startswith(prefix):
        return ""
    return content


def _extract_data_url_mime_type(data_url: str) -> str:
    head, _sep, _tail = data_url.partition(",")
    if not head.startswith("data:"):
        return ""
    return head[5:].split(";", 1)[0].strip()

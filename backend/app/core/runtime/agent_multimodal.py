from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from app.core.schemas.node_system import NodeSystemStateDefinition, NodeSystemStateType
from app.core.storage.skill_artifact_store import read_skill_artifact_file_metadata
from app.tools.video_frame_fallback import extract_video_frame_attachments


MAX_INLINE_VIDEO_BYTES = 16 * 1024 * 1024
DEFAULT_VIDEO_FRAME_COUNT = 4


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
    seen: set[tuple[str, str, str]] = set()
    schema = state_schema or {}
    for state_key, value in input_values.items():
        definition = schema.get(state_key)
        attachment = _build_media_attachment(state_key, value, definition)
        if attachment is not None and _remember_attachment(attachment, seen):
            attachments.append(attachment)
        for artifact_attachment in _collect_artifact_media_attachments(state_key, value, definition):
            if _remember_attachment(artifact_attachment, seen):
                attachments.append(artifact_attachment)
    return attachments


def prepare_model_input_attachments(
    input_attachments: list[dict[str, Any]],
    *,
    max_inline_video_bytes: int = MAX_INLINE_VIDEO_BYTES,
    video_frame_count: int = DEFAULT_VIDEO_FRAME_COUNT,
    extract_video_frame_attachments_func: Any = extract_video_frame_attachments,
) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
    prepared: list[dict[str, Any]] = []
    warnings: list[str] = []
    large_video_fallbacks: list[dict[str, Any]] = []

    for attachment in input_attachments:
        if not isinstance(attachment, dict):
            continue
        attachment_type = str(attachment.get("type") or "").strip().lower()
        if attachment_type not in {"image", "video"}:
            continue

        data_url = str(attachment.get("data_url") or "").strip()
        if data_url.startswith(f"data:{attachment_type}/"):
            prepared.append({**attachment, "type": attachment_type, "data_url": data_url})
            continue

        filesystem_path = str(attachment.get("filesystem_path") or "").strip()
        if not filesystem_path:
            continue
        file_path = Path(filesystem_path)
        attachment_name = str(attachment.get("name") or file_path.name)
        if not file_path.is_file():
            warnings.append(f"Media artifact '{attachment.get('name') or filesystem_path}' no longer exists.")
            continue

        size = _normalize_int(attachment.get("size"), file_path.stat().st_size)
        if attachment_type == "video" and size > max_inline_video_bytes:
            try:
                frames = extract_video_frame_attachments_func(
                    {**attachment, "type": "video", "filesystem_path": str(file_path), "size": size},
                    frame_count=video_frame_count,
                )
            except Exception as exc:
                warnings.append(
                    f"Video artifact '{attachment_name}' was too large to inline and frame extraction failed: {exc}"
                )
                continue
            prepared.extend(frames)
            large_video_fallbacks.append({"name": attachment_name, "frame_count": len(frames)})
            warnings.append(
                f"Video artifact '{attachment_name}' exceeded inline size limit; analyzed extracted frames instead."
            )
            continue

        try:
            encoded = base64.b64encode(file_path.read_bytes()).decode("ascii")
        except OSError as exc:
            warnings.append(f"Media artifact '{attachment.get('name') or file_path.name}' could not be read: {exc}")
            continue
        mime_type = str(attachment.get("mime_type") or _mime_type_for_attachment(attachment_type, file_path.name)).strip()
        prepared.append(
            {
                **attachment,
                "type": attachment_type,
                "mime_type": mime_type,
                "data_url": f"data:{mime_type};base64,{encoded}",
            }
        )

    return prepared, warnings, {"large_video_fallbacks": large_video_fallbacks}


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


def _collect_artifact_media_attachments(
    state_key: str,
    value: Any,
    definition: NodeSystemStateDefinition | None,
) -> list[dict[str, Any]]:
    return [
        attachment
        for record in _iter_artifact_candidate_records(value, definition)
        if (attachment := _build_artifact_media_attachment(state_key, record, definition)) is not None
    ]


def _iter_artifact_candidate_records(
    value: Any,
    definition: NodeSystemStateDefinition | None,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if isinstance(value, dict):
        if _extract_local_path(value):
            records.append(value)
        for child in value.values():
            records.extend(_iter_artifact_candidate_records(child, definition))
        return records
    if isinstance(value, list):
        for item in value:
            records.extend(_iter_artifact_candidate_records(item, definition))
        return records
    if (
        isinstance(value, str)
        and definition is not None
        and definition.type in {NodeSystemStateType.IMAGE, NodeSystemStateType.VIDEO}
    ):
        records.append({"local_path": value, "content_type": f"{definition.type.value}/*"})
    return records


def _build_artifact_media_attachment(
    state_key: str,
    record: dict[str, Any],
    definition: NodeSystemStateDefinition | None,
) -> dict[str, Any] | None:
    local_path = _extract_local_path(record)
    if not local_path:
        return None
    try:
        metadata = read_skill_artifact_file_metadata(local_path)
    except (FileNotFoundError, ValueError):
        return None

    content_type = str(
        record.get("content_type")
        or record.get("contentType")
        or metadata.get("content_type")
        or ""
    ).strip()
    media_type = _resolve_media_type(content_type, str(metadata.get("path") or local_path), definition)
    if media_type not in {"image", "video"}:
        return None

    name = str(record.get("filename") or record.get("name") or metadata.get("name") or Path(local_path).name).strip()
    return {
        "type": media_type,
        "source": "skill_artifact",
        "state_key": state_key,
        "name": name,
        "mime_type": _normalize_media_mime_type(content_type, media_type, name),
        "size": metadata.get("size"),
        "local_path": metadata.get("path"),
        "filesystem_path": str(metadata.get("filesystem_path")),
    }


def _extract_local_path(record: dict[str, Any]) -> str:
    for key in ("local_path", "localPath", "path"):
        value = record.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def _resolve_media_type(
    content_type: str,
    local_path: str,
    definition: NodeSystemStateDefinition | None,
) -> str:
    normalized_type = content_type.lower()
    if normalized_type.startswith("image/"):
        return "image"
    if normalized_type.startswith("video/"):
        return "video"
    if definition is not None and definition.type == NodeSystemStateType.IMAGE:
        return "image"
    if definition is not None and definition.type == NodeSystemStateType.VIDEO:
        return "video"
    lower_path = local_path.lower()
    if lower_path.endswith(
        (".avif", ".bmp", ".gif", ".heic", ".ico", ".jpg", ".jpeg", ".png", ".svg", ".tif", ".tiff", ".webp")
    ):
        return "image"
    if lower_path.endswith(
        (".3gp", ".avi", ".flv", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".ogv", ".webm")
    ):
        return "video"
    return ""


def _normalize_media_mime_type(content_type: str, media_type: str, filename: str) -> str:
    normalized = content_type.strip().lower()
    if normalized.startswith(f"{media_type}/") and "*" not in normalized:
        return normalized
    return _mime_type_for_attachment(media_type, filename)


def _mime_type_for_attachment(media_type: str, filename: str) -> str:
    import mimetypes

    guessed = mimetypes.guess_type(filename)[0] or ""
    if guessed.startswith(f"{media_type}/"):
        return guessed
    return "image/png" if media_type == "image" else "video/mp4"


def _normalize_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _remember_attachment(attachment: dict[str, Any], seen: set[tuple[str, str, str]]) -> bool:
    marker = (
        str(attachment.get("type") or ""),
        str(attachment.get("state_key") or ""),
        str(attachment.get("data_url") or attachment.get("local_path") or attachment.get("filesystem_path") or ""),
    )
    if marker in seen:
        return False
    seen.add(marker)
    return True


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

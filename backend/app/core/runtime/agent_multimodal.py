from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

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
    cleanup_paths: list[str] = []

    for attachment in input_attachments:
        if not isinstance(attachment, dict):
            continue
        attachment_type = str(attachment.get("type") or "").strip().lower()
        if attachment_type not in {"image", "audio", "video"}:
            continue

        filesystem_path = str(attachment.get("filesystem_path") or "").strip()
        attachment_name = str(attachment.get("name") or filesystem_path or attachment_type).strip()

        if filesystem_path:
            file_path = Path(filesystem_path)
            if not file_path.is_file():
                warnings.append(f"Media artifact '{attachment.get('name') or filesystem_path}' no longer exists.")
                continue

            size = _normalize_int(attachment.get("size"), file_path.stat().st_size)
            mime_type = str(
                attachment.get("mime_type") or _mime_type_for_attachment(attachment_type, file_path.name)
            ).strip()
            file_attachment = {
                **attachment,
                "type": attachment_type,
                "name": str(attachment.get("name") or file_path.name),
                "mime_type": mime_type,
                "size": size,
                "filesystem_path": str(file_path),
                "file_url": file_path.resolve().as_uri(),
            }
            if attachment_type == "video" and size > max_inline_video_bytes:
                frame_output_dir = Path(tempfile.mkdtemp(prefix="graphite_video_frames_"))
                cleanup_paths.append(str(frame_output_dir))
                try:
                    frames = extract_video_frame_attachments_func(
                        file_attachment,
                        frame_count=video_frame_count,
                        output_dir=frame_output_dir,
                    )
                except Exception as exc:
                    warnings.append(
                        f"Video artifact '{attachment_name}' was too large to pass directly and frame extraction failed: {exc}"
                    )
                    continue
                prepared.extend(dict(frame) for frame in frames if isinstance(frame, dict))
                large_video_fallbacks.append({"name": attachment_name, "frame_count": len(frames)})
                warnings.append(
                    f"Video artifact '{attachment_name}' exceeded direct media size limit; analyzed extracted frames instead."
                )
                continue

            prepared.append(file_attachment)
            continue

        file_url = _attachment_url(attachment)
        if file_url:
            prepared.append({**attachment, "type": attachment_type, "file_url": file_url})
            continue

    return prepared, warnings, {"large_video_fallbacks": large_video_fallbacks, "cleanup_paths": cleanup_paths}


def _attachment_url(attachment: dict[str, Any]) -> str:
    for key in ("file_url", "url"):
        value = str(attachment.get(key) or "").strip()
        if not value:
            continue
        if value.startswith("file://"):
            return _normalize_file_url(value)
        return value
    return ""


def _normalize_file_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme != "file":
        return value
    path = unquote(parsed.path or "")
    if not path:
        return value
    return Path(path).resolve().as_uri()


def _build_media_attachment(
    state_key: str,
    value: Any,
    definition: NodeSystemStateDefinition | None,
) -> dict[str, Any] | None:
    envelope = normalize_uploaded_file_envelope(value)
    state_type = definition.type if definition is not None else None
    expected_type = _expected_media_type(state_type, envelope)
    if expected_type not in {"image", "audio", "video"}:
        return None
    record = envelope if envelope is not None else value if isinstance(value, dict) else None
    if not isinstance(record, dict) or not _extract_local_path(record):
        return None
    return _build_artifact_media_attachment(state_key, record, definition)


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
    envelope = normalize_uploaded_file_envelope(value)
    if envelope is not None and _extract_local_path(envelope):
        records.append(envelope)
        return records
    if definition is not None and definition.type == NodeSystemStateType.RESULT_PACKAGE:
        records.extend(_iter_result_package_artifact_candidate_records(value))
        return records
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
        and definition.type
        in {
            NodeSystemStateType.FILE,
            NodeSystemStateType.IMAGE,
            NodeSystemStateType.AUDIO,
            NodeSystemStateType.VIDEO,
        }
    ):
        records.append({"local_path": value, "content_type": _declared_file_state_content_type(definition.type)})
    return records


def _iter_result_package_artifact_candidate_records(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, dict) or value.get("kind") != "result_package":
        return []

    outputs = value.get("outputs")
    if not isinstance(outputs, dict):
        return []

    records: list[dict[str, Any]] = []
    for raw_output in outputs.values():
        if not isinstance(raw_output, dict):
            continue
        output_type = _coerce_state_type(raw_output.get("type"))
        if output_type not in {
            NodeSystemStateType.FILE,
            NodeSystemStateType.IMAGE,
            NodeSystemStateType.AUDIO,
            NodeSystemStateType.VIDEO,
        }:
            continue
        records.extend(_iter_artifact_candidate_records(raw_output.get("value"), NodeSystemStateDefinition(type=output_type)))
    return records


def _coerce_state_type(value: Any) -> NodeSystemStateType:
    try:
        return NodeSystemStateType(str(value or "json").strip())
    except ValueError:
        return NodeSystemStateType.JSON


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
    if media_type not in {"image", "audio", "video"}:
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
    if normalized_type.startswith("audio/"):
        return "audio"
    if definition is not None and definition.type == NodeSystemStateType.IMAGE:
        return "image"
    if definition is not None and definition.type == NodeSystemStateType.AUDIO:
        return "audio"
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
    if lower_path.endswith((".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav")):
        return "audio"
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
    if media_type == "image":
        return "image/png"
    if media_type == "audio":
        return "audio/mpeg"
    return "video/mp4"


def _normalize_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _remember_attachment(attachment: dict[str, Any], seen: set[tuple[str, str, str]]) -> bool:
    marker = (
        str(attachment.get("type") or ""),
        str(attachment.get("state_key") or ""),
        str(attachment.get("local_path") or attachment.get("filesystem_path") or attachment.get("file_url") or ""),
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
    if state_type == NodeSystemStateType.AUDIO:
        return "audio"
    if state_type == NodeSystemStateType.VIDEO:
        return "video"
    if envelope is None:
        return ""
    detected_type = str(envelope.get("detectedType") if envelope else "").strip().lower()
    return detected_type if detected_type in {"image", "audio", "video"} else ""


def _declared_file_state_content_type(state_type: NodeSystemStateType) -> str:
    if state_type == NodeSystemStateType.IMAGE:
        return "image/*"
    if state_type == NodeSystemStateType.AUDIO:
        return "audio/*"
    if state_type == NodeSystemStateType.VIDEO:
        return "video/*"
    return ""

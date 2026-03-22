from __future__ import annotations

import base64
import binascii
import json
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import unquote, unquote_to_bytes, urlparse

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
    cleanup_paths: list[str] = []

    for attachment in input_attachments:
        if not isinstance(attachment, dict):
            continue
        attachment_type = str(attachment.get("type") or "").strip().lower()
        if attachment_type not in {"image", "video"}:
            continue

        data_url = str(attachment.get("data_url") or "").strip()
        filesystem_path = str(attachment.get("filesystem_path") or "").strip()
        attachment_name = str(attachment.get("name") or filesystem_path or attachment_type).strip()

        if not filesystem_path and data_url.startswith(f"data:{attachment_type}/"):
            try:
                materialized_attachment, temp_dir = _materialize_data_url_attachment(attachment, attachment_type, data_url)
            except ValueError as exc:
                warnings.append(f"Media attachment '{attachment_name}' could not be prepared: {exc}")
                continue
            cleanup_paths.append(str(temp_dir))
            filesystem_path = str(materialized_attachment["filesystem_path"])
            attachment = materialized_attachment
            attachment_name = str(attachment.get("name") or Path(filesystem_path).name)

        if filesystem_path:
            file_path = Path(filesystem_path)
            if not file_path.is_file():
                warnings.append(f"Media artifact '{attachment.get('name') or filesystem_path}' no longer exists.")
                continue

            size = _normalize_int(attachment.get("size"), file_path.stat().st_size)
            mime_type = str(
                attachment.get("mime_type") or _mime_type_for_attachment(attachment_type, file_path.name)
            ).strip()
            file_attachment = _without_data_url(
                {
                    **attachment,
                    "type": attachment_type,
                    "name": str(attachment.get("name") or file_path.name),
                    "mime_type": mime_type,
                    "size": size,
                    "filesystem_path": str(file_path),
                    "file_url": file_path.resolve().as_uri(),
                }
            )
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
                prepared.extend(_without_data_url(frame) for frame in frames if isinstance(frame, dict))
                large_video_fallbacks.append({"name": attachment_name, "frame_count": len(frames)})
                warnings.append(
                    f"Video artifact '{attachment_name}' exceeded direct media size limit; analyzed extracted frames instead."
                )
                continue

            prepared.append(file_attachment)
            continue

        file_url = _attachment_url(attachment)
        if file_url:
            prepared.append(_without_data_url({**attachment, "type": attachment_type, "file_url": file_url}))
            continue

    return prepared, warnings, {"large_video_fallbacks": large_video_fallbacks, "cleanup_paths": cleanup_paths}


def _materialize_data_url_attachment(
    attachment: dict[str, Any],
    attachment_type: str,
    data_url: str,
) -> tuple[dict[str, Any], Path]:
    mime_type, payload = _split_data_url_payload(data_url)
    if not mime_type.startswith(f"{attachment_type}/"):
        raise ValueError("data URL media type does not match the attachment type.")

    temp_dir = Path(tempfile.mkdtemp(prefix="graphite_agent_media_"))
    name = str(attachment.get("name") or "").strip() or f"{attachment_type}{_suffix_for_mime_type(mime_type)}"
    filename = _safe_attachment_filename(name, mime_type, attachment_type)
    target = temp_dir / filename
    target.write_bytes(payload)
    return (
        _without_data_url(
            {
                **attachment,
                "type": attachment_type,
                "name": filename,
                "mime_type": str(attachment.get("mime_type") or mime_type).strip() or mime_type,
                "size": len(payload),
                "filesystem_path": str(target),
                "file_url": target.resolve().as_uri(),
            }
        ),
        temp_dir,
    )


def _split_data_url_payload(data_url: str) -> tuple[str, bytes]:
    head, separator, data = str(data_url or "").partition(",")
    if not separator or not head.startswith("data:"):
        raise ValueError("invalid data URL.")
    mime_type = head[5:].split(";", 1)[0].strip()
    if not mime_type:
        raise ValueError("data URL is missing a media type.")
    if ";base64" in head.lower():
        try:
            return mime_type, base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("data URL base64 payload is invalid.") from exc
    return mime_type, unquote_to_bytes(data)


def _safe_attachment_filename(name: str, mime_type: str, attachment_type: str) -> str:
    candidate = Path(name).name.strip() or f"{attachment_type}{_suffix_for_mime_type(mime_type)}"
    if Path(candidate).suffix:
        return candidate
    return f"{candidate}{_suffix_for_mime_type(mime_type)}"


def _suffix_for_mime_type(mime_type: str) -> str:
    import mimetypes

    guessed = mimetypes.guess_extension(mime_type.strip().lower()) or ""
    if guessed:
        return guessed
    if mime_type.startswith("image/"):
        return ".png"
    if mime_type == "video/webm":
        return ".webm"
    if mime_type in {"video/quicktime", "video/mov"}:
        return ".mov"
    return ".mp4"


def _attachment_url(attachment: dict[str, Any]) -> str:
    for key in ("file_url", "url"):
        value = str(attachment.get(key) or "").strip()
        if not value or value.startswith("data:"):
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


def _without_data_url(attachment: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(attachment)
    cleaned.pop("data_url", None)
    return cleaned


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

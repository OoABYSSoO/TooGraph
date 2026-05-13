from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024


def inline_provider_image_attachments(
    input_attachments: list[dict[str, Any]] | None,
    *,
    max_inline_image_bytes: int = MAX_INLINE_IMAGE_BYTES,
) -> list[dict[str, Any]] | None:
    if not isinstance(input_attachments, list):
        return input_attachments

    prepared: list[dict[str, Any]] = []
    changed = False
    for attachment in input_attachments:
        if not isinstance(attachment, dict):
            prepared.append(attachment)
            continue

        next_attachment = dict(attachment)
        if _attachment_type(next_attachment) == "image":
            data_url = _existing_data_url(next_attachment) or _build_image_data_url(
                next_attachment,
                max_inline_image_bytes=max_inline_image_bytes,
            )
            if data_url and next_attachment.get("data_url") != data_url:
                next_attachment["data_url"] = data_url
                changed = True
        prepared.append(next_attachment)

    return prepared if changed else input_attachments


def _build_image_data_url(attachment: dict[str, Any], *, max_inline_image_bytes: int) -> str:
    existing = _existing_data_url(attachment)
    if existing:
        return existing

    path = _resolve_local_path(attachment)
    if path is None or not path.is_file():
        return ""

    size = path.stat().st_size
    if max_inline_image_bytes > 0 and size > max_inline_image_bytes:
        return ""

    mime_type = _image_mime_type(attachment, path)
    if not mime_type.startswith("image/"):
        return ""

    payload = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime_type};base64,{payload}"


def _existing_data_url(attachment: dict[str, Any]) -> str:
    for key in ("data_url", "file_url", "url"):
        value = str(attachment.get(key) or "").strip()
        if value.startswith("data:image/"):
            return value
    return ""


def _resolve_local_path(attachment: dict[str, Any]) -> Path | None:
    filesystem_path = str(attachment.get("filesystem_path") or "").strip()
    if filesystem_path:
        return Path(filesystem_path)

    for key in ("file_url", "url"):
        value = str(attachment.get(key) or "").strip()
        parsed = urlparse(value)
        if parsed.scheme == "file" and parsed.path:
            return Path(unquote(parsed.path))
    return None


def _image_mime_type(attachment: dict[str, Any], path: Path) -> str:
    mime_type = str(attachment.get("mime_type") or "").strip().lower()
    if mime_type.startswith("image/"):
        return mime_type
    guessed, _encoding = mimetypes.guess_type(path.name)
    return guessed if guessed and guessed.startswith("image/") else "image/jpeg"


def _attachment_type(attachment: dict[str, Any]) -> str:
    return str(attachment.get("type") or "").strip().lower()

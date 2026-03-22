from __future__ import annotations

from pathlib import Path
from typing import Any


def build_openai_user_content(user_prompt: str, input_attachments: list[dict[str, Any]] | None = None) -> Any:
    media_attachments = _normalize_media_attachments(input_attachments)
    if not media_attachments:
        return user_prompt

    content: list[dict[str, Any]] = []
    if user_prompt:
        content.append({"type": "text", "text": user_prompt})
    for attachment in media_attachments:
        if attachment["type"] == "image":
            content.append({"type": "image_url", "image_url": {"url": attachment["url"]}})
        elif attachment["type"] == "video":
            content.append({"type": "video_url", "video_url": {"url": attachment["url"]}})
    return content


def build_anthropic_user_content(user_prompt: str, input_attachments: list[dict[str, Any]] | None = None) -> Any:
    media_attachments = _normalize_media_attachments(input_attachments)
    if not media_attachments:
        return user_prompt

    content: list[dict[str, Any]] = []
    if user_prompt:
        content.append({"type": "text", "text": user_prompt})
    for attachment in media_attachments:
        if attachment["type"] == "image":
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": attachment["url"],
                    },
                }
            )
        elif attachment["type"] == "video":
            content.append(
                {
                    "type": "video",
                    "source": {
                        "type": "url",
                        "url": attachment["url"],
                    },
                }
            )
    return content


def build_gemini_user_parts(user_prompt: str, input_attachments: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    if user_prompt:
        parts.append({"text": user_prompt})
    for attachment in _normalize_media_attachments(input_attachments):
        parts.append(
            {
                "file_data": {
                    "mime_type": attachment.get("mime_type") or _fallback_mime_type(attachment["type"]),
                    "file_uri": attachment["url"],
                }
            }
        )
    return parts or [{"text": ""}]


def build_codex_responses_user_content(user_prompt: str, input_attachments: list[dict[str, Any]] | None = None) -> Any:
    media_attachments = _normalize_media_attachments(input_attachments)
    if not media_attachments:
        return user_prompt

    content: list[dict[str, Any]] = []
    if user_prompt:
        content.append({"type": "input_text", "text": user_prompt})
    for attachment in media_attachments:
        if attachment["type"] == "image":
            content.append({"type": "input_image", "image_url": attachment["url"]})
        elif attachment["type"] == "video":
            content.append({"type": "input_video", "video_url": attachment["url"]})
    return content


def _normalize_media_attachments(input_attachments: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    if not isinstance(input_attachments, list):
        return normalized
    for attachment in input_attachments:
        if not isinstance(attachment, dict):
            continue
        attachment_type = str(attachment.get("type") or "").strip().lower()
        if attachment_type not in {"image", "video"}:
            continue
        if str(attachment.get("data_url") or "").strip().startswith("data:"):
            raise ValueError("Model media attachments must use file_url, url, or filesystem_path; data_url is not supported.")
        url = _attachment_url(attachment)
        if not url:
            continue
        normalized.append({**attachment, "type": attachment_type, "url": url})
    return normalized


def _attachment_url(attachment: dict[str, Any]) -> str:
    for key in ("file_url", "url"):
        value = str(attachment.get(key) or "").strip()
        if value and not value.startswith("data:"):
            return value
    filesystem_path = str(attachment.get("filesystem_path") or "").strip()
    if filesystem_path:
        return Path(filesystem_path).resolve().as_uri()
    return ""


def _fallback_mime_type(attachment_type: str) -> str:
    return "image/png" if attachment_type == "image" else "video/mp4"

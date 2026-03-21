from __future__ import annotations

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
            content.append({"type": "image_url", "image_url": {"url": attachment["data_url"]}})
        elif attachment["type"] == "video":
            content.append({"type": "video_url", "video_url": {"url": attachment["data_url"]}})
    return content


def build_anthropic_user_content(user_prompt: str, input_attachments: list[dict[str, Any]] | None = None) -> Any:
    media_attachments = _normalize_media_attachments(input_attachments)
    if not media_attachments:
        return user_prompt

    content: list[dict[str, Any]] = []
    if user_prompt:
        content.append({"type": "text", "text": user_prompt})
    for attachment in media_attachments:
        mime_type, data = split_data_url(attachment["data_url"])
        if attachment["type"] == "image":
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": attachment.get("mime_type") or mime_type,
                        "data": data,
                    },
                }
            )
        elif attachment["type"] == "video":
            content.append(
                {
                    "type": "video",
                    "source": {
                        "type": "base64",
                        "media_type": attachment.get("mime_type") or mime_type,
                        "data": data,
                    },
                }
            )
    return content


def build_gemini_user_parts(user_prompt: str, input_attachments: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    if user_prompt:
        parts.append({"text": user_prompt})
    for attachment in _normalize_media_attachments(input_attachments):
        mime_type, data = split_data_url(attachment["data_url"])
        parts.append(
            {
                "inline_data": {
                    "mime_type": attachment.get("mime_type") or mime_type,
                    "data": data,
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
            content.append({"type": "input_image", "image_url": attachment["data_url"]})
        elif attachment["type"] == "video":
            content.append({"type": "input_video", "video_url": attachment["data_url"]})
    return content


def split_data_url(data_url: str) -> tuple[str, str]:
    head, separator, data = str(data_url or "").partition(",")
    if not separator or not head.startswith("data:"):
        return "", str(data_url or "")
    mime_type = head[5:].split(";", 1)[0].strip()
    return mime_type, data


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
        data_url = str(attachment.get("data_url") or "").strip()
        if not data_url.startswith(f"data:{attachment_type}/"):
            continue
        normalized.append({**attachment, "type": attachment_type, "data_url": data_url})
    return normalized

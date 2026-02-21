from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.storage.database import MODEL_LOG_DATA_DIR


MODEL_REQUEST_LOG_PATH = MODEL_LOG_DATA_DIR / "model_requests.jsonl"


def append_model_request_log(
    *,
    provider_id: str,
    transport: str,
    model: str,
    path: str,
    request_raw: dict[str, Any],
    response_raw: dict[str, Any],
    duration_ms: int,
    status_code: int | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    MODEL_REQUEST_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    entry = {
        "id": f"log_{uuid4().hex[:12]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "duration_ms": max(0, int(duration_ms)),
        "provider_id": str(provider_id or "").strip() or "unknown",
        "transport": str(transport or "").strip() or "unknown",
        "model": str(model or "").strip(),
        "path": _normalize_log_path(path),
        "status_code": status_code,
        "error": str(error or "").strip(),
        "request_raw": sanitize_payload_for_log(request_raw),
        "response_raw": sanitize_payload_for_log(response_raw),
    }
    with MODEL_REQUEST_LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return _hydrate_log_entry(entry)


def list_model_request_logs(*, page: int = 1, size: int = 20, query: str = "") -> dict[str, Any]:
    page = max(1, int(page or 1))
    size = max(1, min(int(size or 20), 100))
    query_text = str(query or "").strip().lower()

    entries = _read_raw_log_entries()
    entries.reverse()
    if query_text:
        entries = [
            entry
            for entry in entries
            if query_text in json.dumps(entry, ensure_ascii=False).lower()
        ]

    total = len(entries)
    start = (page - 1) * size
    paginated = entries[start : start + size]
    return {
        "entries": [_hydrate_log_entry(entry) for entry in paginated],
        "total": total,
        "page": page,
        "size": size,
        "pages": math.ceil(total / size) if total else 0,
    }


def sanitize_payload_for_log(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): sanitize_media_value_for_log(raw_value)
            if str(key) in {"url", "image", "video"}
            else sanitize_payload_for_log(raw_value)
            for key, raw_value in value.items()
        }
    if isinstance(value, list):
        return [sanitize_payload_for_log(item) for item in value]
    if isinstance(value, str) and value.startswith("data:"):
        return summarize_data_url(value)
    return value


def sanitize_media_value_for_log(value: Any) -> Any:
    if isinstance(value, list):
        return [sanitize_media_value_for_log(item) for item in value]
    if isinstance(value, str):
        if value.startswith("data:"):
            return summarize_data_url(value)
        if value.startswith("file://"):
            return f"<file-url {value[7:]}>"
    return sanitize_payload_for_log(value)


def summarize_data_url(url: str) -> str:
    head, _sep, _tail = url.partition(",")
    mime = "unknown"
    if head.startswith("data:"):
        mime = head[5:].split(";", 1)[0] or "unknown"
    return f"<data-url mime={mime} chars={len(url)}>"


def _read_raw_log_entries() -> list[dict[str, Any]]:
    if not MODEL_REQUEST_LOG_PATH.exists():
        return []
    entries: list[dict[str, Any]] = []
    with MODEL_REQUEST_LOG_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict):
                entries.append(payload)
    return entries


def _hydrate_log_entry(entry: dict[str, Any]) -> dict[str, Any]:
    request_raw = entry.get("request_raw") if isinstance(entry.get("request_raw"), dict) else {}
    response_raw = entry.get("response_raw") if isinstance(entry.get("response_raw"), dict) else {}
    return {
        "id": str(entry.get("id") or ""),
        "timestamp": str(entry.get("timestamp") or ""),
        "duration_ms": int(entry.get("duration_ms") or 0),
        "provider_id": str(entry.get("provider_id") or "unknown"),
        "transport": str(entry.get("transport") or "unknown"),
        "model": str(entry.get("model") or _get_request_model(request_raw)),
        "path": _normalize_log_path(str(entry.get("path") or "")),
        "status_code": entry.get("status_code"),
        "error": str(entry.get("error") or ""),
        "request_kind": detect_request_kind(request_raw, str(entry.get("path") or "")),
        "messages": build_display_messages(request_raw),
        "reasoning": extract_reasoning(response_raw),
        "content": extract_response_content(response_raw),
        "request_raw": request_raw,
        "response_raw": response_raw,
    }


def build_display_messages(request_raw: dict[str, Any]) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    system = request_raw.get("system") or request_raw.get("instructions") or request_raw.get("system_instruction")
    if system:
        messages.append({"role": "system", "body": extract_content(system)})

    raw_messages = request_raw.get("messages")
    if isinstance(raw_messages, list):
        for item in raw_messages:
            if not isinstance(item, dict):
                continue
            messages.append(
                {
                    "role": str(item.get("role") or "unknown"),
                    "body": extract_content(item.get("content")),
                }
            )

    codex_input = request_raw.get("input")
    if isinstance(codex_input, list):
        for item in codex_input:
            if not isinstance(item, dict):
                continue
            messages.append(
                {
                    "role": str(item.get("role") or "input"),
                    "body": extract_content(item.get("content")),
                }
            )

    gemini_contents = request_raw.get("contents")
    if isinstance(gemini_contents, list):
        for item in gemini_contents:
            if not isinstance(item, dict):
                continue
            role = str(item.get("role") or "user")
            messages.append({"role": role, "body": extract_content(item.get("parts"))})

    return messages


def extract_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [extract_content(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        if "text" in value:
            return extract_content(value.get("text"))
        if "content" in value:
            return extract_content(value.get("content"))
        if "thinking" in value:
            return extract_content(value.get("thinking"))
        if "image_url" in value:
            return extract_content(value.get("image_url"))
        if "url" in value:
            return str(value.get("url") or "")
        if "parts" in value:
            return extract_content(value.get("parts"))
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def extract_reasoning(response_raw: dict[str, Any]) -> str:
    reasoning = response_raw.get("reasoning") or response_raw.get("reasoning_content")
    if reasoning:
        return extract_content(reasoning).strip()

    choices = response_raw.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        delta = first_choice.get("delta") if isinstance(first_choice, dict) else {}
        for source in (message, delta):
            if isinstance(source, dict):
                value = source.get("reasoning_content") or source.get("reasoning")
                if value:
                    return extract_content(value).strip()

    output = response_raw.get("output")
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            if item.get("type") == "reasoning":
                parts.append(extract_content(item.get("summary") or item.get("content") or item.get("text")))
        return "\n".join(part for part in parts if part).strip()

    return ""


def extract_response_content(response_raw: dict[str, Any]) -> str:
    if response_raw.get("output_text"):
        return extract_content(response_raw.get("output_text")).strip()
    if response_raw.get("content"):
        return extract_content(response_raw.get("content")).strip()
    if response_raw.get("error"):
        return extract_content(response_raw.get("error")).strip()
    if response_raw.get("message"):
        return extract_content(response_raw.get("message")).strip()

    choices = response_raw.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        delta = first_choice.get("delta") if isinstance(first_choice, dict) else {}
        for source in (message, delta):
            if isinstance(source, dict):
                value = source.get("content")
                if value:
                    return extract_content(value).strip()

    candidates = response_raw.get("candidates")
    if isinstance(candidates, list) and candidates:
        first_candidate = candidates[0] if isinstance(candidates[0], dict) else {}
        content = first_candidate.get("content") if isinstance(first_candidate, dict) else {}
        if isinstance(content, dict):
            return extract_content(content.get("parts")).strip()

    output = response_raw.get("output")
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            if item.get("type") in {"message", "text"}:
                parts.append(extract_content(item.get("content") or item.get("text")))
        return "\n".join(part for part in parts if part).strip()

    return ""


def detect_request_kind(request_raw: dict[str, Any], path: str) -> str:
    normalized_path = str(path or "").strip().lower()
    if normalized_path.endswith("/count_tokens"):
        return "count-tokens"
    if any(marker in normalized_path for marker in ("/chat/completions", "/messages", "/responses", ":generatecontent")):
        return "chat"
    if normalized_path.endswith("/models"):
        return "models"
    return "request"


def _get_request_model(request_raw: dict[str, Any]) -> str:
    model = request_raw.get("model")
    return model.strip() if isinstance(model, str) else ""


def _normalize_log_path(path: str) -> str:
    normalized = str(path or "").strip()
    if not normalized:
        return "/"
    return normalized if normalized.startswith("/") else f"/{normalized}"

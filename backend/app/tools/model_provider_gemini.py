from __future__ import annotations

import time
from typing import Any, Callable

from app.core.model_provider_templates import TRANSPORT_GEMINI_GENERATE_CONTENT
from app.core.thinking_levels import build_native_thinking_payload
from app.tools.model_provider_http import DEFAULT_REQUEST_TIMEOUT_SEC
from app.tools.model_provider_multimodal import build_gemini_user_parts
from app.tools.model_provider_response_parsing import normalize_message_text, parse_sse_json_events


def extract_gemini_text(response_payload: dict[str, Any]) -> str:
    candidates = response_payload.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        return ""
    first_candidate = candidates[0] if isinstance(candidates[0], dict) else {}
    content = first_candidate.get("content") if isinstance(first_candidate, dict) else {}
    parts = content.get("parts") if isinstance(content, dict) else None
    if not isinstance(parts, list):
        return ""
    return "\n".join(
        str(part.get("text") or "").strip()
        for part in parts
        if isinstance(part, dict) and str(part.get("text") or "").strip()
    ).strip()


def extract_gemini_stream_delta(event: dict[str, Any]) -> str:
    candidates = event.get("candidates")
    if not isinstance(candidates, list):
        return ""
    text_parts: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        content = candidate.get("content")
        parts = content.get("parts") if isinstance(content, dict) else None
        if not isinstance(parts, list):
            continue
        for part in parts:
            if isinstance(part, dict):
                text = normalize_message_text(part.get("text"))
                if text:
                    text_parts.append(text)
    return "".join(text_parts)


def coalesce_gemini_stream_response(stream_text: str) -> dict[str, Any]:
    events = parse_sse_json_events(stream_text)
    if not events:
        raise ValueError("Gemini stream response did not include JSON events.")

    response_id = ""
    usage: dict[str, Any] | None = None
    text_parts: list[str] = []
    for event in events:
        response_id = str(event.get("responseId") or response_id)
        if isinstance(event.get("usageMetadata"), dict):
            usage = event["usageMetadata"]
        candidates = event.get("candidates")
        if not isinstance(candidates, list):
            continue
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content")
            parts = content.get("parts") if isinstance(content, dict) else None
            if not isinstance(parts, list):
                continue
            for part in parts:
                if isinstance(part, dict):
                    text = normalize_message_text(part.get("text"))
                    if text:
                        text_parts.append(text)

    if not text_parts:
        raise ValueError("Gemini stream response did not include text deltas.")

    payload: dict[str, Any] = {
        "candidates": [{"content": {"parts": [{"text": "".join(text_parts)}]}}],
    }
    if response_id:
        payload["responseId"] = response_id
    if usage:
        payload["usageMetadata"] = usage
    payload["_stream"] = {
        "event_count": len(events),
        "events": events,
        "output_chunks": text_parts,
        "reasoning_chunks": [],
        "raw_text": stream_text,
    }
    return payload


def chat_gemini(
    *,
    provider_id: str,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None,
    thinking_level: str,
    append_request_log: Callable[..., None],
    post_streaming_json_with_fallback_fn: Callable[..., tuple[dict[str, Any], dict[str, Any], str | None, bool]],
    on_delta: Callable[[str], None] | None = None,
    input_attachments: list[dict[str, Any]] | None = None,
) -> tuple[str, dict[str, Any]]:
    request_payload: dict[str, Any] = {
        "system_instruction": {
            "parts": {
                "text": system_prompt,
            }
        },
        "contents": [
            {
                "role": "user",
                "parts": build_gemini_user_parts(user_prompt, input_attachments),
            }
        ],
        "generationConfig": {
            "temperature": temperature,
        },
    }
    if max_tokens is not None:
        request_payload["generationConfig"]["maxOutputTokens"] = max_tokens
    native_thinking_payload = build_native_thinking_payload(
        provider_id=provider_id,
        transport=TRANSPORT_GEMINI_GENERATE_CONTENT,
        model=model,
        thinking_level=thinking_level,
    )
    if isinstance(native_thinking_payload.get("generationConfig"), dict):
        request_payload["generationConfig"].update(native_thinking_payload["generationConfig"])

    model_name = model.removeprefix("models/")
    started_at = time.monotonic()
    path = f"/models/{model_name}:streamGenerateContent"
    fallback_path = f"/models/{model_name}:generateContent"
    params = {"key": str(api_key or "").strip(), "alt": "sse"} if str(api_key or "").strip() else {"alt": "sse"}
    fallback_params = {"key": str(api_key or "").strip()} if str(api_key or "").strip() else None
    logged_request_payload = request_payload
    stream_fallback_error: str | None = None
    used_stream = True
    try:
        response_payload, logged_request_payload, stream_fallback_error, used_stream = post_streaming_json_with_fallback_fn(
            stream_url=f"{base_url}{path}",
            fallback_url=f"{base_url}{fallback_path}",
            timeout_sec=DEFAULT_REQUEST_TIMEOUT_SEC,
            stream_params=params,
            fallback_params=fallback_params,
            stream_payload=request_payload,
            fallback_payload=request_payload,
            parse_stream=coalesce_gemini_stream_response,
            error_label=f"{provider_id} request failed",
            on_delta=on_delta,
            extract_stream_delta=extract_gemini_stream_delta,
        )
    except Exception as exc:
        append_request_log(
            provider_id=provider_id,
            transport=TRANSPORT_GEMINI_GENERATE_CONTENT,
            model=model_name,
            path=path if used_stream else fallback_path,
            request_raw=logged_request_payload,
            response_raw={"error": str(exc)},
            started_at=started_at,
            status_code=None,
            error=str(exc),
        )
        raise
    append_request_log(
        provider_id=provider_id,
        transport=TRANSPORT_GEMINI_GENERATE_CONTENT,
        model=model_name,
        path=path if used_stream else fallback_path,
        request_raw=logged_request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )
    return extract_gemini_text(response_payload), {
        "model": model_name,
        "provider_id": provider_id,
        "temperature": temperature,
        "reasoning": "",
        "usage": response_payload.get("usageMetadata"),
        "timings": None,
        "response_id": response_payload.get("responseId"),
        "thinking_enabled": bool(native_thinking_payload),
        "thinking_level": thinking_level,
        "reasoning_format": "gemini-thinking-config" if native_thinking_payload else None,
        "stream_fallback_error": stream_fallback_error,
    }

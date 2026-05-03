from __future__ import annotations

import time
from typing import Any, Callable

from app.core.model_provider_templates import TRANSPORT_OPENAI_COMPATIBLE
from app.core.thinking_levels import build_native_thinking_payload
from app.tools.model_provider_http import DEFAULT_REQUEST_TIMEOUT_SEC, build_auth_headers
from app.tools.model_provider_multimodal import build_openai_user_content
from app.tools.model_provider_response_parsing import normalize_message_text, parse_sse_json_events


def extract_openai_chat_text(response_payload: dict[str, Any]) -> tuple[str, str]:
    choices = response_payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        if isinstance(message, dict):
            content = normalize_message_text(message.get("content")).strip()
            reasoning = normalize_message_text(
                message.get("reasoning_content") or message.get("reasoning")
            ).strip()
            return content, reasoning

    return (
        normalize_message_text(response_payload.get("content")).strip(),
        normalize_message_text(response_payload.get("reasoning")).strip(),
    )


def extract_openai_chat_stream_delta(event: dict[str, Any]) -> str:
    choices = event.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    source = first_choice.get("delta") or first_choice.get("message") or {}
    if not isinstance(source, dict):
        return ""
    return normalize_message_text(source.get("content"))


def coalesce_openai_chat_stream_response(stream_text: str) -> dict[str, Any]:
    events = parse_sse_json_events(stream_text)
    if not events:
        raise ValueError("OpenAI-compatible stream response did not include JSON events.")

    response_id = ""
    response_model = ""
    usage: dict[str, Any] | None = None
    finish_reason: str | None = None
    text_parts: list[str] = []
    reasoning_parts: list[str] = []
    for event in events:
        response_id = str(event.get("id") or response_id)
        response_model = str(event.get("model") or response_model)
        if isinstance(event.get("usage"), dict):
            usage = event["usage"]
        choices = event.get("choices")
        if not isinstance(choices, list) or not choices:
            continue
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        finish_reason = first_choice.get("finish_reason") or finish_reason
        source = first_choice.get("delta") or first_choice.get("message") or {}
        if not isinstance(source, dict):
            continue
        content = normalize_message_text(source.get("content"))
        reasoning = normalize_message_text(source.get("reasoning_content") or source.get("reasoning"))
        if content:
            text_parts.append(content)
        if reasoning:
            reasoning_parts.append(reasoning)

    if not text_parts and not reasoning_parts:
        raise ValueError("OpenAI-compatible stream response did not include text deltas.")

    message: dict[str, Any] = {"content": "".join(text_parts)}
    if reasoning_parts:
        message["reasoning_content"] = "".join(reasoning_parts)
    choice: dict[str, Any] = {"message": message}
    if finish_reason is not None:
        choice["finish_reason"] = finish_reason
    payload: dict[str, Any] = {"choices": [choice]}
    if response_id:
        payload["id"] = response_id
    if response_model:
        payload["model"] = response_model
    if usage:
        payload["usage"] = usage
    payload["_stream"] = {
        "event_count": len(events),
        "events": events,
        "output_chunks": text_parts,
        "reasoning_chunks": reasoning_parts,
        "raw_text": stream_text,
    }
    return payload


def chat_openai_compatible(
    *,
    provider_id: str,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None,
    auth_header: str,
    auth_scheme: str,
    thinking_level: str,
    append_request_log: Callable[..., None],
    post_streaming_json_with_fallback_fn: Callable[..., tuple[dict[str, Any], dict[str, Any], str | None, bool]],
    on_delta: Callable[[str], None] | None = None,
    input_attachments: list[dict[str, Any]] | None = None,
) -> tuple[str, dict[str, Any]]:
    request_payload: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": build_openai_user_content(user_prompt, input_attachments)},
        ],
    }
    if max_tokens is not None:
        request_payload["max_tokens"] = max_tokens
    native_thinking_payload = build_native_thinking_payload(
        provider_id=provider_id,
        transport=TRANSPORT_OPENAI_COMPATIBLE,
        model=model,
        thinking_level=thinking_level,
    )
    request_payload.update(native_thinking_payload)

    started_at = time.monotonic()
    path = "/chat/completions"
    fallback_payload = {**request_payload, "stream": False}
    logged_request_payload = request_payload
    stream_fallback_error: str | None = None
    try:
        response_payload, logged_request_payload, stream_fallback_error, _used_stream = post_streaming_json_with_fallback_fn(
            stream_url=f"{base_url}{path}",
            timeout_sec=DEFAULT_REQUEST_TIMEOUT_SEC,
            headers=build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
            stream_payload=request_payload,
            fallback_payload=fallback_payload,
            parse_stream=coalesce_openai_chat_stream_response,
            error_label=f"{provider_id} request failed",
            on_delta=on_delta,
            extract_stream_delta=extract_openai_chat_stream_delta,
        )
    except Exception as exc:
        append_request_log(
            provider_id=provider_id,
            transport=TRANSPORT_OPENAI_COMPATIBLE,
            model=model,
            path=path,
            request_raw=logged_request_payload,
            response_raw={"error": str(exc)},
            started_at=started_at,
            status_code=None,
            error=str(exc),
        )
        raise
    append_request_log(
        provider_id=provider_id,
        transport=TRANSPORT_OPENAI_COMPATIBLE,
        model=model,
        path=path,
        request_raw=logged_request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )
    content, reasoning = extract_openai_chat_text(response_payload)
    return content, {
        "model": response_payload.get("model") or model,
        "provider_id": provider_id,
        "temperature": temperature,
        "reasoning": reasoning,
        "usage": response_payload.get("usage"),
        "timings": response_payload.get("timings"),
        "response_id": response_payload.get("id"),
        "thinking_enabled": bool(native_thinking_payload),
        "thinking_level": thinking_level,
        "reasoning_format": "reasoning_effort" if native_thinking_payload else None,
        "stream_fallback_error": stream_fallback_error,
    }

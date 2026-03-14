from __future__ import annotations

import time
from typing import Any, Callable

from app.core.model_provider_templates import TRANSPORT_ANTHROPIC_MESSAGES
from app.core.thinking_levels import build_native_thinking_payload
from app.tools.model_provider_http import DEFAULT_REQUEST_TIMEOUT_SEC, anthropic_headers
from app.tools.model_provider_response_parsing import normalize_message_text, parse_sse_json_events


def extract_anthropic_text(response_payload: dict[str, Any]) -> str:
    blocks = response_payload.get("content")
    if isinstance(blocks, list):
        return "\n".join(
            str(block.get("text") or "").strip()
            for block in blocks
            if isinstance(block, dict) and str(block.get("text") or "").strip()
        ).strip()
    return normalize_message_text(blocks).strip()


def extract_anthropic_stream_delta(event: dict[str, Any]) -> str:
    delta = event.get("delta")
    if not isinstance(delta, dict):
        return ""
    delta_type = str(delta.get("type") or "").strip()
    if delta_type != "text_delta":
        return ""
    return normalize_message_text(delta.get("text"))


def coalesce_anthropic_stream_response(stream_text: str) -> dict[str, Any]:
    events = parse_sse_json_events(stream_text)
    if not events:
        raise ValueError("Anthropic stream response did not include JSON events.")

    response_id = ""
    response_model = ""
    usage: dict[str, Any] | None = None
    text_parts: list[str] = []
    reasoning_parts: list[str] = []
    for event in events:
        message = event.get("message")
        if isinstance(message, dict):
            response_id = str(message.get("id") or response_id)
            response_model = str(message.get("model") or response_model)
            if isinstance(message.get("usage"), dict):
                usage = message["usage"]

        delta = event.get("delta")
        if isinstance(delta, dict):
            if isinstance(delta.get("usage"), dict):
                usage = {**(usage or {}), **delta["usage"]}
            delta_type = str(delta.get("type") or "").strip()
            text = normalize_message_text(delta.get("text"))
            thinking = normalize_message_text(delta.get("thinking") or delta.get("reasoning"))
            if delta_type == "text_delta" and text:
                text_parts.append(text)
            elif delta_type in {"thinking_delta", "reasoning_delta"} and (thinking or text):
                reasoning_parts.append(thinking or text)

        if isinstance(event.get("usage"), dict):
            usage = {**(usage or {}), **event["usage"]}

    if not text_parts and not reasoning_parts:
        raise ValueError("Anthropic stream response did not include text deltas.")

    payload: dict[str, Any] = {
        "content": [{"type": "text", "text": "".join(text_parts)}],
    }
    if response_id:
        payload["id"] = response_id
    if response_model:
        payload["model"] = response_model
    if usage:
        payload["usage"] = usage
    if reasoning_parts:
        payload["reasoning"] = "".join(reasoning_parts)
    payload["_stream"] = {
        "event_count": len(events),
        "events": events,
        "output_chunks": text_parts,
        "reasoning_chunks": reasoning_parts,
        "raw_text": stream_text,
    }
    return payload


def chat_anthropic(
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
) -> tuple[str, dict[str, Any]]:
    native_thinking_payload = build_native_thinking_payload(
        provider_id=provider_id,
        transport=TRANSPORT_ANTHROPIC_MESSAGES,
        model=model,
        thinking_level=thinking_level,
    )
    budget_tokens = native_thinking_payload.get("thinking", {}).get("budget_tokens")
    max_output_tokens = max_tokens or 4096
    if isinstance(budget_tokens, int):
        max_output_tokens = max(max_output_tokens, budget_tokens + 1024)
    request_payload: dict[str, Any] = {
        "model": model,
        "system": system_prompt,
        "max_tokens": max_output_tokens,
        "temperature": temperature,
        "stream": True,
        "messages": [{"role": "user", "content": user_prompt}],
    }
    request_payload.update(native_thinking_payload)
    started_at = time.monotonic()
    path = "/messages"
    fallback_payload = {**request_payload, "stream": False}
    logged_request_payload = request_payload
    stream_fallback_error: str | None = None
    try:
        response_payload, logged_request_payload, stream_fallback_error, _used_stream = post_streaming_json_with_fallback_fn(
            stream_url=f"{base_url}{path}",
            timeout_sec=DEFAULT_REQUEST_TIMEOUT_SEC,
            headers=anthropic_headers(api_key),
            stream_payload=request_payload,
            fallback_payload=fallback_payload,
            parse_stream=coalesce_anthropic_stream_response,
            error_label=f"{provider_id} request failed",
            on_delta=on_delta,
            extract_stream_delta=extract_anthropic_stream_delta,
        )
    except Exception as exc:
        append_request_log(
            provider_id=provider_id,
            transport=TRANSPORT_ANTHROPIC_MESSAGES,
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
        transport=TRANSPORT_ANTHROPIC_MESSAGES,
        model=model,
        path=path,
        request_raw=logged_request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )
    return extract_anthropic_text(response_payload), {
        "model": response_payload.get("model") or model,
        "provider_id": provider_id,
        "temperature": temperature,
        "reasoning": normalize_message_text(response_payload.get("reasoning")).strip(),
        "usage": response_payload.get("usage"),
        "timings": None,
        "response_id": response_payload.get("id"),
        "thinking_enabled": bool(native_thinking_payload),
        "thinking_level": thinking_level,
        "reasoning_format": "anthropic-thinking" if native_thinking_payload else None,
        "stream_fallback_error": stream_fallback_error,
    }

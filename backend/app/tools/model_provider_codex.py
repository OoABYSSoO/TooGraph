from __future__ import annotations

import time
from typing import Any, Callable

import httpx

from app.core.model_provider_templates import TRANSPORT_CODEX_RESPONSES
from app.core.thinking_levels import build_native_thinking_payload
from app.tools.model_provider_http import (
    DEFAULT_REQUEST_TIMEOUT_SEC,
    build_auth_headers,
    parse_json_or_stream_text,
    read_streaming_response_text,
)
from app.tools.model_provider_response_parsing import normalize_message_text, parse_sse_json_events
from app.tools.openai_codex_client import codex_http_client_kwargs


class CodexAuthExpiredError(RuntimeError):
    pass


def extract_codex_responses_text(response_payload: dict[str, Any]) -> tuple[str, str]:
    output_text = normalize_message_text(response_payload.get("output_text")).strip()
    if output_text:
        return output_text, normalize_message_text(response_payload.get("reasoning")).strip()

    text_parts: list[str] = []
    reasoning_parts: list[str] = []
    output = response_payload.get("output")
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("type") or "").strip()
            content = item.get("content")
            if item_type == "reasoning":
                summary = item.get("summary")
                reasoning_text = normalize_message_text(summary or item.get("text")).strip()
                if reasoning_text:
                    reasoning_parts.append(reasoning_text)
                continue
            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    part_text = normalize_message_text(part.get("text") or part.get("content")).strip()
                    if part_text:
                        text_parts.append(part_text)
            else:
                item_text = normalize_message_text(content or item.get("text")).strip()
                if item_text:
                    text_parts.append(item_text)

    return "\n".join(text_parts).strip(), "\n".join(reasoning_parts).strip()


def extract_codex_stream_delta(event: dict[str, Any]) -> str:
    event_type = str(event.get("type") or event.get("_event") or "").strip()
    delta = event.get("delta")
    if isinstance(delta, str) and delta and ("output_text" in event_type or event_type.endswith(".delta")):
        return delta
    text = event.get("text")
    if isinstance(text, str) and text and "output_text" in event_type:
        return text
    return ""


def coalesce_codex_stream_response(stream_text: str) -> dict[str, Any]:
    events = parse_sse_json_events(stream_text)
    if not events:
        raise ValueError("Codex stream response did not include JSON events.")

    response_payload: dict[str, Any] = {}
    text_parts: list[str] = []
    reasoning_parts: list[str] = []
    for event in events:
        event_type = str(event.get("type") or event.get("_event") or "").strip()
        response = event.get("response")
        if isinstance(response, dict):
            response_payload.update(response)

        delta = event.get("delta")
        if isinstance(delta, str) and delta:
            if "reasoning" in event_type:
                reasoning_parts.append(delta)
            elif "output_text" in event_type or event_type.endswith(".delta"):
                text_parts.append(delta)

        text = event.get("text")
        if isinstance(text, str) and text and not text_parts and "output_text" in event_type:
            text_parts.append(text)

        item = event.get("item")
        if isinstance(item, dict) and event_type in {"response.output_item.done", "response.output_item.added"}:
            item_text, item_reasoning = extract_codex_responses_text({"output": [item]})
            if item_text and not text_parts:
                text_parts.append(item_text)
            if item_reasoning and not reasoning_parts:
                reasoning_parts.append(item_reasoning)

    if text_parts and not response_payload.get("output_text"):
        response_payload["output_text"] = "".join(text_parts)
    if reasoning_parts and not response_payload.get("reasoning"):
        response_payload["reasoning"] = "".join(reasoning_parts)
    if not response_payload:
        response_payload = {"output_text": "".join(text_parts), "reasoning": "".join(reasoning_parts)}
    response_payload["_stream"] = {
        "event_count": len(events),
        "events": events,
        "output_chunks": text_parts,
        "reasoning_chunks": reasoning_parts,
        "raw_text": stream_text,
    }
    return response_payload


def post_codex_responses_once(
    *,
    base_url: str,
    access_token: str,
    request_payload: dict[str, Any],
    provider_id: str,
    on_delta: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    try:
        with httpx.Client(**codex_http_client_kwargs(timeout=DEFAULT_REQUEST_TIMEOUT_SEC)) as client:
            headers = build_auth_headers(api_key=access_token)
            headers["Accept"] = "text/event-stream"

            def handle_stream_event(event_payload: dict[str, Any]) -> None:
                if on_delta is None:
                    return
                delta = extract_codex_stream_delta(event_payload)
                if delta:
                    on_delta(delta)

            with client.stream(
                "POST",
                f"{base_url}/responses",
                headers=headers,
                json=request_payload,
            ) as response:
                if getattr(response, "status_code", 0) >= 400 and hasattr(response, "read"):
                    response.read()
                response.raise_for_status()
                payload = parse_json_or_stream_text(
                    read_streaming_response_text(response, on_event=handle_stream_event),
                    coalesce_codex_stream_response,
                )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 401:
            raise CodexAuthExpiredError("Codex access token expired.") from exc
        detail = exc.response.text.strip()
        raise RuntimeError(f"{provider_id} request failed: HTTP {exc.response.status_code} {detail[:600]}") from exc
    except httpx.HTTPError as exc:
        raise RuntimeError(f"{provider_id} request failed: {exc}") from exc
    except ValueError as exc:
        raise RuntimeError(f"{provider_id} request failed: invalid JSON: {exc}") from exc

    if not isinstance(payload, dict):
        raise RuntimeError(f"{provider_id} request failed: unexpected payload shape.")
    return payload


def chat_codex_responses(
    *,
    provider_id: str,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    thinking_level: str,
    resolve_access_token: Callable[[], str],
    refresh_access_token: Callable[[], str],
    append_request_log: Callable[..., None],
    on_delta: Callable[[str], None] | None = None,
) -> tuple[str, dict[str, Any]]:
    request_payload: dict[str, Any] = {
        "model": model,
        "instructions": system_prompt,
        "input": [{"role": "user", "content": user_prompt}],
        "store": False,
        "stream": True,
    }
    native_thinking_payload = build_native_thinking_payload(
        provider_id=provider_id,
        transport=TRANSPORT_CODEX_RESPONSES,
        model=model,
        thinking_level=thinking_level,
    )
    request_payload.update(native_thinking_payload)

    started_at = time.monotonic()
    path = "/responses"
    access_token = resolve_access_token()
    try:
        try:
            response_payload = post_codex_responses_once(
                base_url=base_url,
                access_token=access_token,
                request_payload=request_payload,
                provider_id=provider_id,
                on_delta=on_delta,
            )
        except CodexAuthExpiredError:
            response_payload = post_codex_responses_once(
                base_url=base_url,
                access_token=refresh_access_token(),
                request_payload=request_payload,
                provider_id=provider_id,
                on_delta=on_delta,
            )
    except Exception as exc:
        append_request_log(
            provider_id=provider_id,
            transport=TRANSPORT_CODEX_RESPONSES,
            model=model,
            path=path,
            request_raw=request_payload,
            response_raw={"error": str(exc)},
            started_at=started_at,
            status_code=None,
            error=str(exc),
        )
        raise
    append_request_log(
        provider_id=provider_id,
        transport=TRANSPORT_CODEX_RESPONSES,
        model=model,
        path=path,
        request_raw=request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )

    content, reasoning = extract_codex_responses_text(response_payload)
    return content, {
        "model": response_payload.get("model") or model,
        "provider_id": provider_id,
        "temperature": temperature,
        "reasoning": reasoning,
        "usage": response_payload.get("usage"),
        "timings": None,
        "response_id": response_payload.get("id"),
        "thinking_enabled": bool(native_thinking_payload),
        "thinking_level": thinking_level,
        "reasoning_format": "responses-reasoning" if native_thinking_payload else None,
    }

from __future__ import annotations

import json
import time
from typing import Any, Callable

import httpx

from app.core.model_provider_templates import (
    TRANSPORT_ANTHROPIC_MESSAGES,
    TRANSPORT_CODEX_RESPONSES,
    TRANSPORT_GEMINI_GENERATE_CONTENT,
    TRANSPORT_OPENAI_COMPATIBLE,
    get_provider_template,
    normalize_transport,
)
from app.core.storage.settings_store import load_app_settings
from app.core.storage.model_log_store import append_model_request_log
from app.core.thinking_levels import (
    THINKING_LEVEL_MEDIUM,
    THINKING_LEVEL_OFF,
    build_native_thinking_payload,
    normalize_thinking_level,
)
from app.tools.openai_codex_client import (
    DEFAULT_CODEX_MODEL_IDS,
    codex_http_client_kwargs,
    refresh_codex_access_token,
    resolve_codex_access_token,
)
from app.tools.model_provider_http import (
    ANTHROPIC_VERSION,
    DEFAULT_REQUEST_TIMEOUT_SEC,
    append_model_request_log_safely,
    anthropic_headers as _anthropic_headers,
    build_auth_headers as _build_auth_headers,
    dedupe_strings as _dedupe_strings,
    normalize_base_url as _normalize_base_url,
    parse_json_or_stream_text as _parse_json_or_stream_text,
    post_streaming_json_with_fallback,
    read_streaming_response_text as _read_streaming_response_text,
    request_json as _request_json,
)


class CodexAuthExpiredError(RuntimeError):
    pass


def _append_model_request_log_safely(**kwargs: Any) -> None:
    append_model_request_log_safely(**kwargs, log_writer=append_model_request_log)


def _normalize_message_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = [_normalize_message_text(item) for item in value]
        return "\n".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        for key in ("text", "content", "reasoning_content", "reasoning"):
            candidate = value.get(key)
            if candidate:
                return _normalize_message_text(candidate)
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _extract_openai_chat_text(response_payload: dict[str, Any]) -> tuple[str, str]:
    choices = response_payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        if isinstance(message, dict):
            content = _normalize_message_text(message.get("content")).strip()
            reasoning = _normalize_message_text(
                message.get("reasoning_content") or message.get("reasoning")
            ).strip()
            return content, reasoning

    return (
        _normalize_message_text(response_payload.get("content")).strip(),
        _normalize_message_text(response_payload.get("reasoning")).strip(),
    )


def _extract_anthropic_text(response_payload: dict[str, Any]) -> str:
    blocks = response_payload.get("content")
    if isinstance(blocks, list):
        return "\n".join(
            str(block.get("text") or "").strip()
            for block in blocks
            if isinstance(block, dict) and str(block.get("text") or "").strip()
        ).strip()
    return _normalize_message_text(blocks).strip()


def _extract_gemini_text(response_payload: dict[str, Any]) -> str:
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


def _parse_data_model_ids(payload: dict[str, Any]) -> list[str]:
    data = payload.get("data")
    if not isinstance(data, list):
        raise RuntimeError("Model discovery returned an unexpected payload shape.")
    return _dedupe_strings(
        [
            str(item.get("id") or item.get("name") or "").strip()
            for item in data
            if isinstance(item, dict) and str(item.get("id") or item.get("name") or "").strip()
        ]
    )


def _parse_gemini_model_ids(payload: dict[str, Any]) -> list[str]:
    models = payload.get("models")
    if not isinstance(models, list):
        raise RuntimeError("Model discovery returned an unexpected payload shape.")

    model_ids: list[str] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        methods = item.get("supportedGenerationMethods")
        if isinstance(methods, list) and "generateContent" not in methods:
            continue
        name = str(item.get("name") or item.get("baseModelId") or "").strip()
        if not name:
            continue
        model_ids.append(name.removeprefix("models/"))
    return _dedupe_strings(model_ids)


def _parse_codex_model_ids(payload: dict[str, Any]) -> list[str]:
    models = payload.get("models")
    if not isinstance(models, list):
        raise RuntimeError("Model discovery returned an unexpected payload shape.")

    sortable: list[tuple[int, str]] = []
    for item in models:
        if not isinstance(item, dict):
            continue
        if item.get("supported_in_api") is False:
            continue
        visibility = item.get("visibility")
        if isinstance(visibility, str) and visibility.strip().lower() in {"hide", "hidden"}:
            continue
        slug = str(item.get("slug") or item.get("id") or item.get("name") or "").strip()
        if not slug:
            continue
        priority = item.get("priority")
        rank = int(priority) if isinstance(priority, (int, float)) else 10_000
        sortable.append((rank, slug))

    sortable.sort(key=lambda entry: (entry[0], entry[1]))
    return _dedupe_strings([slug for _rank, slug in sortable])


def discover_provider_models(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str = "",
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    timeout_sec: float = 8.0,
) -> list[str]:
    _ = provider_id
    normalized_transport = normalize_transport(transport)
    normalized_base_url = _normalize_base_url(base_url)

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE:
        payload = _request_json(
            method="GET",
            url=f"{normalized_base_url}/models",
            timeout_sec=timeout_sec,
            headers=_build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
            error_label="Model discovery failed",
        )
        return _parse_data_model_ids(payload)

    if normalized_transport == TRANSPORT_ANTHROPIC_MESSAGES:
        payload = _request_json(
            method="GET",
            url=f"{normalized_base_url}/models",
            timeout_sec=timeout_sec,
            headers=_anthropic_headers(api_key),
            error_label="Model discovery failed",
        )
        return _parse_data_model_ids(payload)

    if normalized_transport == TRANSPORT_GEMINI_GENERATE_CONTENT:
        payload = _request_json(
            method="GET",
            url=f"{normalized_base_url}/models",
            timeout_sec=timeout_sec,
            params={"key": str(api_key or "").strip()} if str(api_key or "").strip() else None,
            error_label="Model discovery failed",
        )
        return _parse_gemini_model_ids(payload)

    if normalized_transport == TRANSPORT_CODEX_RESPONSES:
        access_token = resolve_codex_access_token()
        try:
            payload = _request_json(
                method="GET",
                url=f"{normalized_base_url}/models",
                timeout_sec=timeout_sec,
                headers=_build_auth_headers(api_key=access_token),
                params={"client_version": "1.0.0"},
                error_label="Model discovery failed",
                client_kwargs=codex_http_client_kwargs(timeout=timeout_sec),
            )
        except RuntimeError as exc:
            if "HTTP 401" in str(exc):
                access_token = refresh_codex_access_token()
                payload = _request_json(
                    method="GET",
                    url=f"{normalized_base_url}/models",
                    timeout_sec=timeout_sec,
                    headers=_build_auth_headers(api_key=access_token),
                    params={"client_version": "1.0.0"},
                    error_label="Model discovery failed",
                    client_kwargs=codex_http_client_kwargs(timeout=timeout_sec),
                )
            else:
                return list(DEFAULT_CODEX_MODEL_IDS)
        model_ids = _parse_codex_model_ids(payload)
        return model_ids or list(DEFAULT_CODEX_MODEL_IDS)

    raise RuntimeError(f"Unsupported provider transport: {normalized_transport}")  # pragma: no cover


def _chat_openai_compatible(
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
    on_delta: Callable[[str], None] | None = None,
) -> tuple[str, dict[str, Any]]:
    request_payload: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
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
        response_payload, logged_request_payload, stream_fallback_error, _used_stream = post_streaming_json_with_fallback(
            stream_url=f"{base_url}{path}",
            timeout_sec=DEFAULT_REQUEST_TIMEOUT_SEC,
            headers=_build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
            stream_payload=request_payload,
            fallback_payload=fallback_payload,
            parse_stream=_coalesce_openai_chat_stream_response,
            error_label=f"{provider_id} request failed",
            on_delta=on_delta,
            extract_stream_delta=_extract_openai_chat_stream_delta,
        )
    except Exception as exc:
        _append_model_request_log_safely(
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
    _append_model_request_log_safely(
        provider_id=provider_id,
        transport=TRANSPORT_OPENAI_COMPATIBLE,
        model=model,
        path=path,
        request_raw=logged_request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )
    content, reasoning = _extract_openai_chat_text(response_payload)
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


def _chat_anthropic(
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
        response_payload, logged_request_payload, stream_fallback_error, _used_stream = post_streaming_json_with_fallback(
            stream_url=f"{base_url}{path}",
            timeout_sec=DEFAULT_REQUEST_TIMEOUT_SEC,
            headers=_anthropic_headers(api_key),
            stream_payload=request_payload,
            fallback_payload=fallback_payload,
            parse_stream=_coalesce_anthropic_stream_response,
            error_label=f"{provider_id} request failed",
            on_delta=on_delta,
            extract_stream_delta=_extract_anthropic_stream_delta,
        )
    except Exception as exc:
        _append_model_request_log_safely(
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
    _append_model_request_log_safely(
        provider_id=provider_id,
        transport=TRANSPORT_ANTHROPIC_MESSAGES,
        model=model,
        path=path,
        request_raw=logged_request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )
    return _extract_anthropic_text(response_payload), {
        "model": response_payload.get("model") or model,
        "provider_id": provider_id,
        "temperature": temperature,
        "reasoning": _normalize_message_text(response_payload.get("reasoning")).strip(),
        "usage": response_payload.get("usage"),
        "timings": None,
        "response_id": response_payload.get("id"),
        "thinking_enabled": bool(native_thinking_payload),
        "thinking_level": thinking_level,
        "reasoning_format": "anthropic-thinking" if native_thinking_payload else None,
        "stream_fallback_error": stream_fallback_error,
    }


def _chat_gemini(
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
    on_delta: Callable[[str], None] | None = None,
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
                "parts": [{"text": user_prompt}],
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
        response_payload, logged_request_payload, stream_fallback_error, used_stream = post_streaming_json_with_fallback(
            stream_url=f"{base_url}{path}",
            fallback_url=f"{base_url}{fallback_path}",
            timeout_sec=DEFAULT_REQUEST_TIMEOUT_SEC,
            stream_params=params,
            fallback_params=fallback_params,
            stream_payload=request_payload,
            fallback_payload=request_payload,
            parse_stream=_coalesce_gemini_stream_response,
            error_label=f"{provider_id} request failed",
            on_delta=on_delta,
            extract_stream_delta=_extract_gemini_stream_delta,
        )
    except Exception as exc:
        _append_model_request_log_safely(
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
    _append_model_request_log_safely(
        provider_id=provider_id,
        transport=TRANSPORT_GEMINI_GENERATE_CONTENT,
        model=model_name,
        path=path if used_stream else fallback_path,
        request_raw=logged_request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )
    return _extract_gemini_text(response_payload), {
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


def _extract_codex_responses_text(response_payload: dict[str, Any]) -> tuple[str, str]:
    output_text = _normalize_message_text(response_payload.get("output_text")).strip()
    if output_text:
        return output_text, _normalize_message_text(response_payload.get("reasoning")).strip()

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
                reasoning_text = _normalize_message_text(summary or item.get("text")).strip()
                if reasoning_text:
                    reasoning_parts.append(reasoning_text)
                continue
            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    part_text = _normalize_message_text(part.get("text") or part.get("content")).strip()
                    if part_text:
                        text_parts.append(part_text)
            else:
                item_text = _normalize_message_text(content or item.get("text")).strip()
                if item_text:
                    text_parts.append(item_text)

    return "\n".join(text_parts).strip(), "\n".join(reasoning_parts).strip()


def _parse_sse_json_events(stream_text: str) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    event_name = ""
    data_lines: list[str] = []

    def flush_event() -> None:
        nonlocal event_name, data_lines
        if not data_lines:
            event_name = ""
            return
        data = "\n".join(data_lines).strip()
        data_lines = []
        if not data or data == "[DONE]":
            event_name = ""
            return
        try:
            payload = json.loads(data)
        except ValueError:
            event_name = ""
            return
        if isinstance(payload, dict):
            if event_name and "_event" not in payload:
                payload["_event"] = event_name
            events.append(payload)
        event_name = ""

    for raw_line in stream_text.splitlines():
        line = raw_line.rstrip("\r")
        if not line:
            flush_event()
            continue
        if line.startswith("event:"):
            event_name = line[len("event:") :].strip()
            continue
        if line.startswith("data:"):
            data_lines.append(line[len("data:") :].lstrip())
    flush_event()
    return events


def _extract_openai_chat_stream_delta(event: dict[str, Any]) -> str:
    choices = event.get("choices")
    if not isinstance(choices, list) or not choices:
        return ""
    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    source = first_choice.get("delta") or first_choice.get("message") or {}
    if not isinstance(source, dict):
        return ""
    return _normalize_message_text(source.get("content"))


def _extract_anthropic_stream_delta(event: dict[str, Any]) -> str:
    delta = event.get("delta")
    if not isinstance(delta, dict):
        return ""
    delta_type = str(delta.get("type") or "").strip()
    if delta_type != "text_delta":
        return ""
    return _normalize_message_text(delta.get("text"))


def _extract_gemini_stream_delta(event: dict[str, Any]) -> str:
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
                text = _normalize_message_text(part.get("text"))
                if text:
                    text_parts.append(text)
    return "".join(text_parts)


def _extract_codex_stream_delta(event: dict[str, Any]) -> str:
    event_type = str(event.get("type") or event.get("_event") or "").strip()
    delta = event.get("delta")
    if isinstance(delta, str) and delta and ("output_text" in event_type or event_type.endswith(".delta")):
        return delta
    text = event.get("text")
    if isinstance(text, str) and text and "output_text" in event_type:
        return text
    return ""


def _coalesce_openai_chat_stream_response(stream_text: str) -> dict[str, Any]:
    events = _parse_sse_json_events(stream_text)
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
        content = _normalize_message_text(source.get("content"))
        reasoning = _normalize_message_text(source.get("reasoning_content") or source.get("reasoning"))
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


def _coalesce_anthropic_stream_response(stream_text: str) -> dict[str, Any]:
    events = _parse_sse_json_events(stream_text)
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
            text = _normalize_message_text(delta.get("text"))
            thinking = _normalize_message_text(delta.get("thinking") or delta.get("reasoning"))
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


def _coalesce_gemini_stream_response(stream_text: str) -> dict[str, Any]:
    events = _parse_sse_json_events(stream_text)
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
                    text = _normalize_message_text(part.get("text"))
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


def _coalesce_codex_stream_response(stream_text: str) -> dict[str, Any]:
    events = _parse_sse_json_events(stream_text)
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
            item_text, item_reasoning = _extract_codex_responses_text({"output": [item]})
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


def _post_codex_responses_once(
    *,
    base_url: str,
    access_token: str,
    request_payload: dict[str, Any],
    provider_id: str,
    on_delta: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    try:
        with httpx.Client(**codex_http_client_kwargs(timeout=DEFAULT_REQUEST_TIMEOUT_SEC)) as client:
            headers = _build_auth_headers(api_key=access_token)
            headers["Accept"] = "text/event-stream"
            def handle_stream_event(event_payload: dict[str, Any]) -> None:
                if on_delta is None:
                    return
                delta = _extract_codex_stream_delta(event_payload)
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
                payload = _parse_json_or_stream_text(
                    _read_streaming_response_text(response, on_event=handle_stream_event),
                    _coalesce_codex_stream_response,
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


def _chat_codex_responses(
    *,
    provider_id: str,
    base_url: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    thinking_level: str,
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
    access_token = resolve_codex_access_token()
    try:
        try:
            response_payload = _post_codex_responses_once(
                base_url=base_url,
                access_token=access_token,
                request_payload=request_payload,
                provider_id=provider_id,
                on_delta=on_delta,
            )
        except CodexAuthExpiredError:
            response_payload = _post_codex_responses_once(
                base_url=base_url,
                access_token=refresh_codex_access_token(),
                request_payload=request_payload,
                provider_id=provider_id,
                on_delta=on_delta,
            )
    except Exception as exc:
        _append_model_request_log_safely(
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
    _append_model_request_log_safely(
        provider_id=provider_id,
        transport=TRANSPORT_CODEX_RESPONSES,
        model=model,
        path=path,
        request_raw=request_payload,
        response_raw=response_payload,
        started_at=started_at,
        status_code=200,
    )

    content, reasoning = _extract_codex_responses_text(response_payload)
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


def chat_with_model_provider(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None = None,
    thinking_enabled: bool = False,
    thinking_level: str | None = None,
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    on_delta: Callable[[str], None] | None = None,
) -> tuple[str, dict[str, Any]]:
    normalized_transport = normalize_transport(transport)
    normalized_base_url = _normalize_base_url(base_url)
    warnings: list[str] = []
    resolved_thinking_level = normalize_thinking_level(
        thinking_level if thinking_level is not None else (THINKING_LEVEL_MEDIUM if thinking_enabled else THINKING_LEVEL_OFF),
        fallback=THINKING_LEVEL_OFF,
    )

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE:
        content, meta = _chat_openai_compatible(
            provider_id=provider_id,
            base_url=normalized_base_url,
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            auth_header=auth_header,
            auth_scheme=auth_scheme,
            thinking_level=resolved_thinking_level,
            on_delta=on_delta,
        )
    elif normalized_transport == TRANSPORT_ANTHROPIC_MESSAGES:
        content, meta = _chat_anthropic(
            provider_id=provider_id,
            base_url=normalized_base_url,
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_level=resolved_thinking_level,
            on_delta=on_delta,
        )
    elif normalized_transport == TRANSPORT_GEMINI_GENERATE_CONTENT:
        content, meta = _chat_gemini(
            provider_id=provider_id,
            base_url=normalized_base_url,
            api_key=api_key,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_level=resolved_thinking_level,
            on_delta=on_delta,
        )
    elif normalized_transport == TRANSPORT_CODEX_RESPONSES:
        content, meta = _chat_codex_responses(
            provider_id=provider_id,
            base_url=normalized_base_url,
            model=model,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            thinking_level=resolved_thinking_level,
            on_delta=on_delta,
        )
    else:  # pragma: no cover - guarded by normalize_transport
        raise RuntimeError(f"Unsupported provider transport: {normalized_transport}")

    stream_fallback_error = str(meta.get("stream_fallback_error") or "").strip()
    if stream_fallback_error:
        warnings.append(f"Streaming request failed; retried once without streaming. {stream_fallback_error}")
    if not content:
        raise RuntimeError(f"{provider_id} returned an empty response.")
    if resolved_thinking_level != THINKING_LEVEL_OFF and not bool(meta.get("thinking_enabled")):
        warnings.append(
            f"Thinking level '{resolved_thinking_level}' was requested for provider '{provider_id}', but GraphiteUI did not find a native thinking field for this provider/model."
        )
    meta["warnings"] = warnings
    meta.setdefault("thinking_enabled", False)
    meta.setdefault("thinking_level", resolved_thinking_level)
    meta.setdefault("reasoning_format", None)
    meta["base_url"] = normalized_base_url
    return content, meta


def chat_with_model_ref_with_meta(
    *,
    model_ref: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None = None,
    thinking_enabled: bool = False,
    thinking_level: str | None = None,
    on_delta: Callable[[str], None] | None = None,
) -> tuple[str, dict[str, Any]]:
    provider_id, model_name = model_ref.split("/", 1) if "/" in model_ref else ("local", model_ref)
    provider_id = provider_id.strip() or "local"
    model_name = model_name.strip()

    if provider_id == "local":
        from app.tools.local_llm import _chat_with_local_model_with_meta

        return _chat_with_local_model_with_meta(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=model_name,
            provider_id=provider_id,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_enabled=thinking_enabled,
            thinking_level=thinking_level,
            on_delta=on_delta,
        )

    saved_settings = load_app_settings()
    saved_providers = saved_settings.get("model_providers")
    saved_provider = saved_providers.get(provider_id) if isinstance(saved_providers, dict) else {}
    saved_provider = saved_provider if isinstance(saved_provider, dict) else {}
    template = get_provider_template(provider_id)
    provider_config = {**template, **saved_provider}

    auth_scheme = (
        provider_config.get("auth_scheme")
        if provider_config.get("auth_scheme") is not None
        else template.get("auth_scheme", "Bearer")
    )
    return chat_with_model_provider(
        provider_id=provider_id,
        transport=str(provider_config.get("transport") or template["transport"]),
        base_url=str(provider_config.get("base_url") or template["base_url"]),
        api_key=str(provider_config.get("api_key") or ""),
        model=model_name,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        thinking_enabled=thinking_enabled,
        thinking_level=thinking_level,
        auth_header=str(provider_config.get("auth_header") or template.get("auth_header") or "Authorization"),
        auth_scheme=str(auth_scheme or ""),
        on_delta=on_delta,
    )

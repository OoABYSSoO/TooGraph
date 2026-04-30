from __future__ import annotations

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
    codex_http_client_kwargs,
    refresh_codex_access_token,
    resolve_codex_access_token,
)
from app.tools import model_provider_anthropic, model_provider_discovery, model_provider_gemini, model_provider_openai
from app.tools.model_provider_http import (
    ANTHROPIC_VERSION,
    DEFAULT_REQUEST_TIMEOUT_SEC,
    append_model_request_log_safely,
    build_auth_headers as _build_auth_headers,
    normalize_base_url as _normalize_base_url,
    parse_json_or_stream_text as _parse_json_or_stream_text,
    post_streaming_json_with_fallback,
    read_streaming_response_text as _read_streaming_response_text,
)
from app.tools.model_provider_response_parsing import (
    normalize_message_text as _normalize_message_text,
    parse_sse_json_events as _parse_sse_json_events,
)


class CodexAuthExpiredError(RuntimeError):
    pass


def _append_model_request_log_safely(**kwargs: Any) -> None:
    append_model_request_log_safely(**kwargs, log_writer=append_model_request_log)


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
    return model_provider_discovery.discover_provider_models(
        provider_id=provider_id,
        transport=transport,
        base_url=base_url,
        api_key=api_key,
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        timeout_sec=timeout_sec,
        resolve_codex_access_token_fn=resolve_codex_access_token,
        refresh_codex_access_token_fn=refresh_codex_access_token,
    )


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
    return model_provider_openai.chat_openai_compatible(
        provider_id=provider_id,
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        thinking_level=thinking_level,
        append_request_log=_append_model_request_log_safely,
        post_streaming_json_with_fallback_fn=post_streaming_json_with_fallback,
        on_delta=on_delta,
    )


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
    return model_provider_anthropic.chat_anthropic(
        provider_id=provider_id,
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        thinking_level=thinking_level,
        append_request_log=_append_model_request_log_safely,
        post_streaming_json_with_fallback_fn=post_streaming_json_with_fallback,
        on_delta=on_delta,
    )


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
    return model_provider_gemini.chat_gemini(
        provider_id=provider_id,
        base_url=base_url,
        api_key=api_key,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        max_tokens=max_tokens,
        thinking_level=thinking_level,
        append_request_log=_append_model_request_log_safely,
        post_streaming_json_with_fallback_fn=post_streaming_json_with_fallback,
        on_delta=on_delta,
    )


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


def _extract_codex_stream_delta(event: dict[str, Any]) -> str:
    event_type = str(event.get("type") or event.get("_event") or "").strip()
    delta = event.get("delta")
    if isinstance(delta, str) and delta and ("output_text" in event_type or event_type.endswith(".delta")):
        return delta
    text = event.get("text")
    if isinstance(text, str) and text and "output_text" in event_type:
        return text
    return ""


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

from __future__ import annotations

import time
from typing import Any, Callable

from app.core.storage.provider_prompt_cache_store import (
    build_provider_prompt_cache_scope_fingerprint,
    load_provider_prompt_cache_resource,
    remember_provider_prompt_cache_resource,
)
from app.core.model_provider_templates import TRANSPORT_GEMINI_GENERATE_CONTENT
from app.core.thinking_levels import build_native_thinking_payload
from app.tools.model_provider_http import (
    DEFAULT_REQUEST_TIMEOUT_SEC,
    normalize_request_timeout_seconds,
    request_json,
)
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
    request_json_fn: Callable[..., dict[str, Any]] = request_json,
    on_delta: Callable[[str], None] | None = None,
    input_attachments: list[dict[str, Any]] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SEC,
) -> tuple[str, dict[str, Any]]:
    timeout_sec = normalize_request_timeout_seconds(request_timeout_seconds)
    model_name = model.removeprefix("models/")
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
    provider_prompt_cache_result = _apply_gemini_cached_content(
        provider_id=provider_id,
        base_url=base_url,
        api_key=api_key,
        model_name=model_name,
        system_prompt=system_prompt,
        request_payload=request_payload,
        prompt_cache_policy=prompt_cache_policy,
        timeout_sec=timeout_sec,
        request_json_fn=request_json_fn,
    )

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
            timeout_sec=timeout_sec,
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
        "request_timeout_seconds": timeout_sec,
        **(
            {
                "provider_prompt_cache_result": _with_gemini_cached_content_usage(
                    provider_prompt_cache_result,
                    response_payload.get("usageMetadata"),
                )
            }
            if provider_prompt_cache_result
            else {}
        ),
    }


def _apply_gemini_cached_content(
    *,
    provider_id: str,
    base_url: str,
    api_key: str,
    model_name: str,
    system_prompt: str,
    request_payload: dict[str, Any],
    prompt_cache_policy: dict[str, Any] | None,
    timeout_sec: float,
    request_json_fn: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    if not isinstance(prompt_cache_policy, dict):
        return {}
    if str(prompt_cache_policy.get("requested_policy") or "").strip().lower() != "prefer":
        return {}
    if not prompt_cache_policy.get("eligible"):
        return {}
    stable_text = str(system_prompt or "")
    if not stable_text:
        return {}

    cache_key = str(prompt_cache_policy.get("cache_key") or "").strip()
    stable_prefix_hash = str(prompt_cache_policy.get("stable_prefix_hash") or "").strip()
    credential_fingerprint = build_provider_prompt_cache_scope_fingerprint(base_url=base_url, api_key=api_key)
    cached_resource = load_provider_prompt_cache_resource(
        provider_id=provider_id,
        transport=TRANSPORT_GEMINI_GENERATE_CONTENT,
        base_url=base_url,
        model=model_name,
        credential_fingerprint=credential_fingerprint,
        cache_key=cache_key,
        stable_prefix_hash=stable_prefix_hash,
    )
    cached_resource_name = str(cached_resource.get("resource_name") or "").strip()
    if cached_resource_name:
        request_payload.pop("system_instruction", None)
        request_payload["cachedContent"] = cached_resource_name
        result = _gemini_prompt_cache_result(
            prompt_cache_policy=prompt_cache_policy,
            mode="provider_applied",
            provider_cache_control="gemini_cached_content",
            reason="gemini_cached_content_reused",
        )
        result["cached_content_name"] = cached_resource_name
        result["cache_resource_status"] = "reused"
        expires_at = str(cached_resource.get("expires_at") or "").strip()
        if expires_at:
            result["cached_content_expires_at"] = expires_at
        return result

    create_payload: dict[str, Any] = {
        "model": f"models/{model_name}",
        "systemInstruction": {
            "parts": [{"text": stable_text}],
        },
    }
    display_name = _gemini_cache_display_name(cache_key)
    if display_name:
        create_payload["displayName"] = display_name

    params = {"key": str(api_key or "").strip()} if str(api_key or "").strip() else None
    try:
        cache_payload = request_json_fn(
            method="POST",
            url=f"{base_url}/cachedContents",
            timeout_sec=timeout_sec,
            params=params,
            json_payload=create_payload,
            error_label=f"{provider_id} cached content request failed",
        )
    except Exception as exc:
        return _gemini_prompt_cache_result(
            prompt_cache_policy=prompt_cache_policy,
            mode="not_applied",
            provider_cache_control="not_applied",
            reason="gemini_cached_content_create_failed",
            error=str(exc),
        )

    cached_content_name = str(cache_payload.get("name") or "").strip()
    if not cached_content_name:
        return _gemini_prompt_cache_result(
            prompt_cache_policy=prompt_cache_policy,
            mode="not_applied",
            provider_cache_control="not_applied",
            reason="gemini_cached_content_missing_name",
        )

    request_payload.pop("system_instruction", None)
    request_payload["cachedContent"] = cached_content_name
    cached_resource = remember_provider_prompt_cache_resource(
        provider_id=provider_id,
        transport=TRANSPORT_GEMINI_GENERATE_CONTENT,
        base_url=base_url,
        model=model_name,
        credential_fingerprint=credential_fingerprint,
        cache_key=cache_key,
        stable_prefix_hash=stable_prefix_hash,
        resource_name=cached_content_name,
        expires_at=cache_payload.get("expireTime"),
        metadata={"provider": "gemini", "display_name": str(create_payload.get("displayName") or "")},
    )
    result = _gemini_prompt_cache_result(
        prompt_cache_policy=prompt_cache_policy,
        mode="provider_applied",
        provider_cache_control="gemini_cached_content",
        reason="gemini_cached_content_applied",
    )
    result["cached_content_name"] = cached_content_name
    result["cache_resource_status"] = "created"
    expires_at = str(cached_resource.get("expires_at") or "").strip()
    if expires_at:
        result["cached_content_expires_at"] = expires_at
    usage = _gemini_cached_content_creation_usage(cache_payload.get("usageMetadata"))
    if usage:
        result["usage"] = usage
    return result


def _gemini_prompt_cache_result(
    *,
    prompt_cache_policy: dict[str, Any],
    mode: str,
    provider_cache_control: str,
    reason: str,
    error: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "kind": "provider_prompt_cache_result",
        "version": 1,
        "requested_policy": "prefer",
        "eligible": True,
        "mode": mode,
        "provider_cache_control": provider_cache_control,
        "reason": reason,
    }
    for key in ("stable_prefix_hash", "cache_key"):
        value = prompt_cache_policy.get(key)
        if isinstance(value, str) and value.strip():
            result[key] = value.strip()
    if error:
        result["error"] = error
    return result


def _gemini_cache_display_name(cache_key: str) -> str:
    normalized = "".join(char if char.isalnum() else "-" for char in str(cache_key or "").strip()).strip("-")
    if not normalized:
        return ""
    return f"toograph-{normalized}"[:128]


def _gemini_cached_content_creation_usage(usage_metadata: Any) -> dict[str, int]:
    if not isinstance(usage_metadata, dict):
        return {}
    total_tokens = usage_metadata.get("totalTokenCount")
    if not isinstance(total_tokens, (int, float)) or total_tokens < 0:
        return {}
    return {"cache_creation_input_tokens": int(total_tokens)}


def _with_gemini_cached_content_usage(result: dict[str, Any], usage_metadata: Any) -> dict[str, Any]:
    if not isinstance(usage_metadata, dict):
        return result
    cached_tokens = usage_metadata.get("cachedContentTokenCount")
    if not isinstance(cached_tokens, (int, float)) or cached_tokens < 0:
        return result
    usage = dict(result.get("usage") if isinstance(result.get("usage"), dict) else {})
    usage["cache_read_input_tokens"] = int(cached_tokens)
    return {**result, "usage": usage}

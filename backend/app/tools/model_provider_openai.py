from __future__ import annotations

import json
import time
from typing import Any, Callable

from app.core.model_provider_templates import TRANSPORT_OPENAI_COMPATIBLE
from app.core.runtime.structured_output import (
    build_openai_json_schema_response_format,
    should_retry_without_native_structured_output,
)
from app.core.thinking_levels import THINKING_LEVEL_OFF, build_native_thinking_payload, normalize_thinking_level
from app.tools.model_provider_http import DEFAULT_REQUEST_TIMEOUT_SEC, build_auth_headers, normalize_request_timeout_seconds
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


def extract_openai_chat_finish_reason(response_payload: dict[str, Any]) -> str:
    choices = response_payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        finish_reason = first_choice.get("finish_reason") if isinstance(first_choice, dict) else None
        return str(finish_reason or "").strip()
    return str(response_payload.get("finish_reason") or "").strip()


def extract_openai_chat_tool_calls(response_payload: dict[str, Any]) -> list[dict[str, Any]]:
    choices = response_payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0] if isinstance(choices[0], dict) else {}
        message = first_choice.get("message") if isinstance(first_choice, dict) else {}
        if isinstance(message, dict):
            return normalize_openai_tool_calls(message.get("tool_calls"))
    return normalize_openai_tool_calls(response_payload.get("tool_calls"))


def normalize_openai_tool_calls(raw_tool_calls: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_tool_calls, list):
        return []
    normalized: list[dict[str, Any]] = []
    for index, raw_call in enumerate(raw_tool_calls):
        if not isinstance(raw_call, dict):
            continue
        function = raw_call.get("function") if isinstance(raw_call.get("function"), dict) else {}
        raw_arguments = function.get("arguments")
        arguments = _parse_tool_call_arguments(raw_arguments)
        normalized.append(
            {
                "id": str(raw_call.get("id") or f"tool_call_{index}"),
                "type": str(raw_call.get("type") or "function"),
                "name": str(function.get("name") or raw_call.get("name") or "").strip(),
                "arguments": arguments,
                "rawArguments": raw_arguments if isinstance(raw_arguments, str) else "",
            }
        )
    return normalized


def _parse_tool_call_arguments(raw_arguments: Any) -> Any:
    if isinstance(raw_arguments, str):
        try:
            parsed = json.loads(raw_arguments)
            return parsed if isinstance(parsed, (dict, list)) else raw_arguments
        except ValueError:
            return raw_arguments
    if isinstance(raw_arguments, (dict, list)):
        return raw_arguments
    return {}


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
    tool_call_parts: dict[int, dict[str, Any]] = {}
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
        raw_tool_calls = source.get("tool_calls")
        if isinstance(raw_tool_calls, list):
            for fallback_index, raw_tool_call in enumerate(raw_tool_calls):
                if not isinstance(raw_tool_call, dict):
                    continue
                index = int(raw_tool_call.get("index") if isinstance(raw_tool_call.get("index"), int) else fallback_index)
                current = tool_call_parts.setdefault(index, {"function": {"arguments": ""}})
                if raw_tool_call.get("id"):
                    current["id"] = raw_tool_call.get("id")
                if raw_tool_call.get("type"):
                    current["type"] = raw_tool_call.get("type")
                raw_function = raw_tool_call.get("function")
                if isinstance(raw_function, dict):
                    function = current.setdefault("function", {"arguments": ""})
                    if raw_function.get("name"):
                        function["name"] = raw_function.get("name")
                    if raw_function.get("arguments"):
                        function["arguments"] = str(function.get("arguments") or "") + str(raw_function.get("arguments"))

    if not text_parts and not reasoning_parts and not tool_call_parts:
        raise ValueError("OpenAI-compatible stream response did not include text deltas.")

    message: dict[str, Any] = {"content": "".join(text_parts)}
    if reasoning_parts:
        message["reasoning_content"] = "".join(reasoning_parts)
    if tool_call_parts:
        message["tool_calls"] = [
            tool_call_parts[index]
            for index in sorted(tool_call_parts)
        ]
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
        "tool_call_chunks": list(tool_call_parts.values()),
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
    structured_output_schema: dict[str, Any] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    request_timeout_seconds: float = DEFAULT_REQUEST_TIMEOUT_SEC,
    tools: list[dict[str, Any]] | None = None,
) -> tuple[str, dict[str, Any]]:
    timeout_sec = normalize_request_timeout_seconds(request_timeout_seconds)
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
    if structured_output_schema:
        request_payload["response_format"] = build_openai_json_schema_response_format(structured_output_schema)
    if tools:
        request_payload["tools"] = tools
        request_payload["tool_choice"] = "auto"
    native_thinking_payload = build_native_thinking_payload(
        provider_id=provider_id,
        transport=TRANSPORT_OPENAI_COMPATIBLE,
        model=model,
        thinking_level=thinking_level,
    )
    native_thinking_enabled = bool(native_thinking_payload) and (
        normalize_thinking_level(thinking_level, fallback=THINKING_LEVEL_OFF) != THINKING_LEVEL_OFF
    )
    request_payload.update(native_thinking_payload)
    provider_prompt_cache_result = _apply_openai_prompt_cache_key(
        provider_id=provider_id,
        request_payload=request_payload,
        prompt_cache_policy=prompt_cache_policy,
    )

    started_at = time.monotonic()
    path = "/chat/completions"
    fallback_payload = {**request_payload, "stream": False}
    logged_request_payload = request_payload
    stream_fallback_error: str | None = None
    structured_output_fallback_error: str | None = None
    try:
        try:
            response_payload, logged_request_payload, stream_fallback_error, _used_stream = post_streaming_json_with_fallback_fn(
                stream_url=f"{base_url}{path}",
                timeout_sec=timeout_sec,
                headers=build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
                stream_payload=request_payload,
                fallback_payload=fallback_payload,
                parse_stream=coalesce_openai_chat_stream_response,
                error_label=f"{provider_id} request failed",
                on_delta=on_delta,
                extract_stream_delta=extract_openai_chat_stream_delta,
            )
        except Exception as exc:
            if not structured_output_schema or not should_retry_without_native_structured_output(exc):
                raise
            structured_output_fallback_error = str(exc)
            retry_payload = dict(request_payload)
            retry_payload.pop("response_format", None)
            response_payload, logged_request_payload, stream_fallback_error, _used_stream = post_streaming_json_with_fallback_fn(
                stream_url=f"{base_url}{path}",
                timeout_sec=timeout_sec,
                headers=build_auth_headers(api_key=api_key, auth_header=auth_header, auth_scheme=auth_scheme),
                stream_payload=retry_payload,
                fallback_payload={**retry_payload, "stream": False},
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
    tool_calls = extract_openai_chat_tool_calls(response_payload)
    finish_reason = extract_openai_chat_finish_reason(response_payload)
    if provider_prompt_cache_result:
        provider_prompt_cache_result = _with_openai_prompt_cache_usage(
            provider_prompt_cache_result,
            response_payload.get("usage"),
        )
    return content, {
        "model": response_payload.get("model") or model,
        "provider_id": provider_id,
        "temperature": temperature,
        "reasoning": reasoning,
        "tool_calls": tool_calls,
        "finish_reason": finish_reason,
        "usage": response_payload.get("usage"),
        "timings": response_payload.get("timings"),
        "response_id": response_payload.get("id"),
        "thinking_enabled": native_thinking_enabled,
        "thinking_level": thinking_level,
        "reasoning_format": "reasoning_effort" if native_thinking_payload else None,
        "stream_fallback_error": stream_fallback_error,
        "structured_output_strategy": (
            "prompt_validation"
            if structured_output_fallback_error
            else ("json_schema" if structured_output_schema else None)
        ),
        "structured_output_fallback_error": structured_output_fallback_error,
        "request_timeout_seconds": timeout_sec,
        **({"provider_prompt_cache_result": provider_prompt_cache_result} if provider_prompt_cache_result else {}),
    }


def _apply_openai_prompt_cache_key(
    *,
    provider_id: str,
    request_payload: dict[str, Any],
    prompt_cache_policy: dict[str, Any] | None,
) -> dict[str, Any]:
    is_official_openai = str(provider_id or "").strip().lower() == "openai"
    is_compatible_opt_in = isinstance(prompt_cache_policy, dict) and bool(
        prompt_cache_policy.get("openai_compatible_prompt_cache_key")
    )
    if not is_official_openai and not is_compatible_opt_in:
        return {}
    if not isinstance(prompt_cache_policy, dict):
        return {}
    if str(prompt_cache_policy.get("requested_policy") or "").strip().lower() != "prefer":
        return {}
    if not prompt_cache_policy.get("eligible"):
        return {}
    cache_key = str(prompt_cache_policy.get("cache_key") or "").strip()
    if not cache_key:
        return {}

    request_payload["prompt_cache_key"] = cache_key
    provider_cache_control = "openai_prompt_cache_key" if is_official_openai else "openai_compatible_prompt_cache_key"
    result: dict[str, Any] = {
        "kind": "provider_prompt_cache_result",
        "version": 1,
        "requested_policy": "prefer",
        "eligible": True,
        "mode": "provider_applied",
        "provider_cache_control": provider_cache_control,
        "reason": f"{provider_cache_control}_applied",
        "cache_key": cache_key,
    }
    stable_prefix_hash = str(prompt_cache_policy.get("stable_prefix_hash") or "").strip()
    if stable_prefix_hash:
        result["stable_prefix_hash"] = stable_prefix_hash
    return result


def _with_openai_prompt_cache_usage(result: dict[str, Any], usage: Any) -> dict[str, Any]:
    if not isinstance(usage, dict):
        return result
    details = usage.get("prompt_tokens_details")
    if not isinstance(details, dict):
        return result
    cached_tokens = details.get("cached_tokens")
    if not isinstance(cached_tokens, (int, float)) or cached_tokens < 0:
        return result
    return {**result, "usage": {"cached_tokens": int(cached_tokens)}}

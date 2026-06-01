from __future__ import annotations

from contextlib import contextmanager, nullcontext
from contextvars import ContextVar
import json
import tempfile
import threading
import time
from typing import Any, Callable, Iterator

import httpx

from app.core.provider_fallback import resolve_provider_fallback
from app.core.model_provider_costs import build_provider_cost_estimate, provider_model_pricing
from app.core.model_provider_credentials import (
    has_configured_provider_credential,
    select_provider_credential,
    update_provider_credential_pool_after_call,
)
from app.core.model_provider_rates import build_provider_rate_decision, normalize_provider_rate_profile
from app.core.model_provider_templates import (
    TRANSPORT_ANTHROPIC_MESSAGES,
    TRANSPORT_CODEX_RESPONSES,
    TRANSPORT_GEMINI_GENERATE_CONTENT,
    TRANSPORT_OPENAI_COMPATIBLE,
    get_provider_template,
    normalize_transport,
)
from app.core.storage.settings_store import load_app_settings, save_app_settings
from app.core.storage.model_log_store import (
    append_model_request_log,
    claim_provider_rate_wait_queue_turn,
    enqueue_provider_rate_wait_queue_entry,
    evaluate_provider_cost_budget_preflight,
    evaluate_provider_rate_profile_preflight,
    release_provider_rate_reservation,
    release_provider_rate_wait_queue_entry,
    reserve_provider_rate_profile_capacity,
    update_model_request_log_metadata,
)
from app.core.runtime.model_call_context import get_model_call_context, use_model_call_context
from app.core.runtime.structured_output import (
    STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST,
    STRUCTURED_OUTPUT_MODE_VALIDATE_THEN_REPAIR,
    is_lmstudio_native_schema_reasoning_conflict,
    normalize_structured_output_mode,
)
from app.core.thinking_levels import (
    THINKING_LEVEL_HIGH,
    THINKING_LEVEL_OFF,
    normalize_thinking_level,
)
from app.tools.openai_codex_client import (
    refresh_codex_access_token,
    resolve_codex_access_token,
)
from app.tools import (
    model_provider_anthropic,
    model_provider_codex,
    model_provider_discovery,
    model_provider_embedding,
    model_provider_gemini,
    model_provider_openai,
    model_provider_rerank,
)
from app.tools.model_provider_media import inline_provider_image_attachments
from app.tools.video_frame_fallback import (
    build_video_frame_fallback_attachments,
    should_fallback_video_to_frames,
)
from app.tools.model_provider_http import (
    append_model_request_log_safely,
    build_auth_headers as _build_auth_headers,
    normalize_base_url as _normalize_base_url,
    normalize_request_timeout_seconds,
    post_streaming_json_with_fallback,
    request_json,
)


_sleep = time.sleep
_LAST_MODEL_REQUEST_LOG: ContextVar[dict[str, Any]] = ContextVar("toograph_last_model_request_log", default={})


def _append_model_request_log_safely(**kwargs: Any) -> dict[str, Any]:
    result = append_model_request_log_safely(**kwargs, log_writer=append_model_request_log)
    if isinstance(result, dict) and str(result.get("id") or "").strip():
        _LAST_MODEL_REQUEST_LOG.set(result)
        return result
    return {}


_PROVIDER_RATE_CONCURRENCY_LOCK = threading.Lock()
_PROVIDER_RATE_CONCURRENCY_ACTIVE: dict[str, int] = {}
_PROVIDER_RATE_WAIT_MAX_ATTEMPTS = 10
_PROVIDER_RATE_WAIT_QUEUE_POLL_SECONDS = 0.05
_PROVIDER_RATE_WAIT_QUEUE_CONDITION = threading.Condition(threading.Lock())


class ProviderCostBudgetExceeded(RuntimeError):
    def __init__(self, decision: dict[str, Any]) -> None:
        self.decision = dict(decision)
        self.approval_request = decision.get("approval_request") if isinstance(decision.get("approval_request"), dict) else None
        reason = str(decision.get("reason") or "provider_cost_budget_exceeded").strip()
        previous_cost = decision.get("previous_window_cost_usd")
        limit = decision.get("budget_limit_usd")
        super().__init__(f"{reason}: previous_window_cost_usd={previous_cost} budget_limit_usd={limit}")


class ProviderRateProfileExceeded(RuntimeError):
    def __init__(self, decision: dict[str, Any]) -> None:
        self.decision = dict(decision)
        reason = str(decision.get("reason") or "provider_rate_profile_exceeded").strip()
        limit_exceeded = decision.get("limit_exceeded")
        observed_requests = decision.get("observed_requests")
        observed_total_tokens = decision.get("observed_total_tokens")
        observed_concurrency = decision.get("observed_concurrency")
        super().__init__(
            f"{reason}: limit_exceeded={limit_exceeded} "
            f"observed_requests={observed_requests} observed_total_tokens={observed_total_tokens} "
            f"observed_concurrency={observed_concurrency}"
        )


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


def discover_provider_model_items(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str = "",
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    timeout_sec: float = 8.0,
) -> list[dict[str, Any]]:
    return model_provider_discovery.discover_provider_model_items(
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
    input_attachments: list[dict[str, Any]] | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    request_timeout_seconds: float | None = None,
    tools: list[dict[str, Any]] | None = None,
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
        input_attachments=input_attachments,
        structured_output_schema=structured_output_schema,
        prompt_cache_policy=prompt_cache_policy,
        request_timeout_seconds=normalize_request_timeout_seconds(request_timeout_seconds),
        tools=tools,
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
    input_attachments: list[dict[str, Any]] | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    request_timeout_seconds: float | None = None,
    tools: list[dict[str, Any]] | None = None,
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
        input_attachments=input_attachments,
        prompt_cache_policy=prompt_cache_policy,
        request_timeout_seconds=normalize_request_timeout_seconds(request_timeout_seconds),
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
    input_attachments: list[dict[str, Any]] | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    request_timeout_seconds: float | None = None,
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
        request_json_fn=request_json,
        on_delta=on_delta,
        input_attachments=input_attachments,
        prompt_cache_policy=prompt_cache_policy,
        request_timeout_seconds=normalize_request_timeout_seconds(request_timeout_seconds),
    )


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
    input_attachments: list[dict[str, Any]] | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    request_timeout_seconds: float | None = None,
) -> tuple[str, dict[str, Any]]:
    return model_provider_codex.chat_codex_responses(
        provider_id=provider_id,
        base_url=base_url,
        model=model,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=temperature,
        thinking_level=thinking_level,
        resolve_access_token=resolve_codex_access_token,
        refresh_access_token=refresh_codex_access_token,
        append_request_log=_append_model_request_log_safely,
        on_delta=on_delta,
        input_attachments=input_attachments,
        structured_output_schema=structured_output_schema,
        prompt_cache_policy=prompt_cache_policy,
        request_timeout_seconds=normalize_request_timeout_seconds(request_timeout_seconds),
    )


def _embed_openai_compatible(
    *,
    provider_id: str,
    base_url: str,
    api_key: str,
    model: str,
    text: str,
    auth_header: str,
    auth_scheme: str,
    request_timeout_seconds: float | None = None,
) -> tuple[list[float], dict[str, Any]]:
    return model_provider_embedding.embed_openai_compatible(
        provider_id=provider_id,
        base_url=base_url,
        api_key=api_key,
        model=model,
        text=text,
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        append_request_log=_append_model_request_log_safely,
        request_timeout_seconds=normalize_request_timeout_seconds(request_timeout_seconds),
    )


def _rerank_openai_compatible(
    *,
    provider_id: str,
    base_url: str,
    api_key: str,
    model: str,
    query: str,
    documents: list[str],
    top_n: int,
    auth_header: str,
    auth_scheme: str,
    request_timeout_seconds: float | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return model_provider_rerank.rerank_openai_compatible(
        provider_id=provider_id,
        base_url=base_url,
        api_key=api_key,
        model=model,
        query=query,
        documents=documents,
        top_n=top_n,
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        append_request_log=_append_model_request_log_safely,
        request_timeout_seconds=normalize_request_timeout_seconds(request_timeout_seconds),
    )


def embed_text_with_model_provider(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str,
    model: str,
    text: str,
    dimensions: int | None = None,
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    request_timeout_seconds: float | None = None,
) -> tuple[list[float], dict[str, Any]]:
    normalized_transport = normalize_transport(transport)
    normalized_base_url = _normalize_base_url(base_url)
    if normalized_transport != TRANSPORT_OPENAI_COMPATIBLE:
        raise RuntimeError(f"Embedding transport '{normalized_transport}' is not supported for provider '{provider_id}'.")

    vector, meta = _embed_openai_compatible(
        provider_id=provider_id,
        base_url=normalized_base_url,
        api_key=api_key,
        model=model,
        text=text,
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        request_timeout_seconds=request_timeout_seconds,
    )
    if dimensions is not None and int(dimensions) > 0 and len(vector) != int(dimensions):
        raise RuntimeError(f"Expected {int(dimensions)} embedding dimensions from '{provider_id}/{model}', got {len(vector)}.")
    meta["base_url"] = normalized_base_url
    return vector, meta


def rerank_documents_with_model_provider(
    *,
    provider_id: str,
    transport: str,
    base_url: str,
    api_key: str,
    model: str,
    query: str,
    documents: list[str],
    top_n: int | None = None,
    auth_header: str = "Authorization",
    auth_scheme: str = "Bearer",
    request_timeout_seconds: float | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    normalized_transport = normalize_transport(transport)
    normalized_base_url = _normalize_base_url(base_url)
    normalized_documents = [str(document or "") for document in documents]
    if not normalized_documents:
        return [], {
            "provider_id": provider_id,
            "transport": normalized_transport,
            "model": model,
            "result_count": 0,
            "base_url": normalized_base_url,
        }
    normalized_top_n = _bounded_int(top_n, default=len(normalized_documents), minimum=1, maximum=len(normalized_documents))
    if normalized_transport != TRANSPORT_OPENAI_COMPATIBLE:
        raise RuntimeError(f"Rerank transport '{normalized_transport}' is not supported for provider '{provider_id}'.")

    results, meta = _rerank_openai_compatible(
        provider_id=provider_id,
        base_url=normalized_base_url,
        api_key=api_key,
        model=model,
        query=str(query or ""),
        documents=normalized_documents,
        top_n=normalized_top_n,
        auth_header=auth_header,
        auth_scheme=auth_scheme,
        request_timeout_seconds=request_timeout_seconds,
    )
    meta["base_url"] = normalized_base_url
    return results, meta


def rerank_documents_with_model_ref(
    *,
    model_ref: str,
    query: str,
    documents: list[str],
    top_n: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    saved_settings = load_app_settings()
    saved_providers = saved_settings.get("model_providers")
    saved_providers = saved_providers if isinstance(saved_providers, dict) else {}
    provider_id, model_name = _split_model_ref(model_ref)
    requested_model_ref = f"{provider_id}/{model_name}".strip("/")
    _LAST_MODEL_REQUEST_LOG.set({})

    return _rerank_documents_with_model_ref_once(
        model_ref=requested_model_ref,
        saved_providers=saved_providers,
        query=query,
        documents=documents,
        top_n=top_n,
    )


def _rerank_documents_with_model_ref_once(
    *,
    model_ref: str,
    saved_providers: dict[str, Any],
    query: str,
    documents: list[str],
    top_n: int | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    provider_id, model_name = _split_model_ref(model_ref)
    template, provider_config = _provider_config_from_saved(provider_id, saved_providers)
    return rerank_documents_with_model_provider(
        provider_id=provider_id,
        transport=str(provider_config.get("transport") or template["transport"]),
        base_url=str(provider_config.get("base_url") or template["base_url"]),
        api_key=str(provider_config.get("api_key") or ""),
        model=model_name,
        query=query,
        documents=documents,
        top_n=top_n,
        auth_header=str(provider_config.get("auth_header") or template.get("auth_header") or "Authorization"),
        auth_scheme=_provider_auth_scheme(provider_config, template),
        request_timeout_seconds=_provider_request_timeout_seconds(provider_config, template),
    )


def embed_text_with_model_ref(
    *,
    model_ref: str,
    text: str,
    dimensions: int | None = None,
) -> tuple[list[float], dict[str, Any]]:
    saved_settings = load_app_settings()
    saved_providers = saved_settings.get("model_providers")
    saved_providers = saved_providers if isinstance(saved_providers, dict) else {}
    provider_id, model_name = _split_model_ref(model_ref)
    requested_model_ref = f"{provider_id}/{model_name}".strip("/")
    _LAST_MODEL_REQUEST_LOG.set({})

    return _embed_text_with_model_ref_once(
        model_ref=requested_model_ref,
        saved_providers=saved_providers,
        text=text,
        dimensions=dimensions,
    )


def _embed_text_with_model_ref_once(
    *,
    model_ref: str,
    saved_providers: dict[str, Any],
    text: str,
    dimensions: int | None,
) -> tuple[list[float], dict[str, Any]]:
    provider_id, model_name = _split_model_ref(model_ref)
    template, provider_config = _provider_config_from_saved(provider_id, saved_providers)
    return embed_text_with_model_provider(
        provider_id=provider_id,
        transport=str(provider_config.get("transport") or template["transport"]),
        base_url=str(provider_config.get("base_url") or template["base_url"]),
        api_key=str(provider_config.get("api_key") or ""),
        model=model_name,
        text=text,
        dimensions=dimensions,
        auth_header=str(provider_config.get("auth_header") or template.get("auth_header") or "Authorization"),
        auth_scheme=_provider_auth_scheme(provider_config, template),
        request_timeout_seconds=_provider_request_timeout_seconds(provider_config, template),
    )


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
    input_attachments: list[dict[str, Any]] | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    structured_output_mode: str | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    request_timeout_seconds: float | None = None,
    tools: list[dict[str, Any]] | None = None,
) -> tuple[str, dict[str, Any]]:
    normalized_transport = normalize_transport(transport)
    normalized_base_url = _normalize_base_url(base_url)
    normalized_timeout_seconds = normalize_request_timeout_seconds(request_timeout_seconds)
    warnings: list[str] = []
    resolved_structured_output_mode = normalize_structured_output_mode(structured_output_mode)
    first_call_structured_output_schema = (
        structured_output_schema
        if resolved_structured_output_mode == STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST
        else None
    )
    resolved_thinking_level = normalize_thinking_level(
        thinking_level if thinking_level is not None else (THINKING_LEVEL_HIGH if thinking_enabled else THINKING_LEVEL_OFF),
        fallback=THINKING_LEVEL_OFF,
    )

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE:
        def invoke(
            attachments: list[dict[str, Any]] | None,
            schema: dict[str, Any] | None,
        ) -> tuple[str, dict[str, Any]]:
            return _chat_openai_compatible(
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
                input_attachments=attachments,
                structured_output_schema=schema,
                prompt_cache_policy=prompt_cache_policy,
                request_timeout_seconds=normalized_timeout_seconds,
                tools=tools,
            )
    elif normalized_transport == TRANSPORT_ANTHROPIC_MESSAGES:
        def invoke(
            attachments: list[dict[str, Any]] | None,
            schema: dict[str, Any] | None,
        ) -> tuple[str, dict[str, Any]]:
            return _chat_anthropic(
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
                input_attachments=attachments,
                structured_output_schema=schema,
                prompt_cache_policy=prompt_cache_policy,
                request_timeout_seconds=normalized_timeout_seconds,
            )
    elif normalized_transport == TRANSPORT_GEMINI_GENERATE_CONTENT:
        def invoke(
            attachments: list[dict[str, Any]] | None,
            schema: dict[str, Any] | None,
        ) -> tuple[str, dict[str, Any]]:
            return _chat_gemini(
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
                input_attachments=attachments,
                structured_output_schema=schema,
                prompt_cache_policy=prompt_cache_policy,
                request_timeout_seconds=normalized_timeout_seconds,
            )
    elif normalized_transport == TRANSPORT_CODEX_RESPONSES:
        def invoke(
            attachments: list[dict[str, Any]] | None,
            schema: dict[str, Any] | None,
        ) -> tuple[str, dict[str, Any]]:
            return _chat_codex_responses(
                provider_id=provider_id,
                base_url=normalized_base_url,
                model=model,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                thinking_level=resolved_thinking_level,
                on_delta=on_delta,
                input_attachments=attachments,
                structured_output_schema=schema,
                prompt_cache_policy=prompt_cache_policy,
                request_timeout_seconds=normalized_timeout_seconds,
            )
    else:  # pragma: no cover - guarded by normalize_transport
        raise RuntimeError(f"Unsupported provider transport: {normalized_transport}")

    request_attachments = _prepare_request_attachments_for_transport(normalized_transport, input_attachments)
    content, meta = _invoke_with_video_auto_fallback(
        invoke,
        input_attachments=request_attachments,
        transport=normalized_transport,
        structured_output_schema=first_call_structured_output_schema,
    )
    if _is_lmstudio_native_schema_reasoning_conflict(
        provider_id=provider_id,
        structured_output_mode=resolved_structured_output_mode,
        structured_output_schema=structured_output_schema,
        content=content,
        meta=meta,
    ):
        warnings.append(
            "LM Studio returned schema-shaped JSON in reasoning while native structured output produced empty final content; "
            "retried with Validate then repair."
        )
        content, meta = _invoke_with_video_auto_fallback(
            invoke,
            input_attachments=request_attachments,
            transport=normalized_transport,
            structured_output_schema=None,
        )
        resolved_structured_output_mode = STRUCTURED_OUTPUT_MODE_VALIDATE_THEN_REPAIR
        meta["structured_output_native_schema_fallback_used"] = True
        meta["structured_output_native_schema_conflict_provider"] = "lmstudio"
        meta["structured_output_strategy"] = "prompt_validation"
    stream_fallback_error = str(meta.get("stream_fallback_error") or "").strip()
    if stream_fallback_error:
        warnings.append(f"Streaming request failed; retried once without streaming. {stream_fallback_error}")
    structured_output_fallback_error = str(meta.get("structured_output_fallback_error") or "").strip()
    if structured_output_fallback_error:
        warnings.append(
            "Provider rejected native JSON Schema response_format; retried without native structured output. "
            f"{structured_output_fallback_error}"
        )
    video_fallback_warning = str(meta.pop("_video_fallback_warning", "") or "").strip()
    if video_fallback_warning:
        warnings.append(video_fallback_warning)
    if not content:
        tool_calls = meta.get("tool_calls")
        if not tools or not isinstance(tool_calls, list) or not tool_calls:
            raise RuntimeError(f"{provider_id} returned an empty response.")
    if resolved_thinking_level != THINKING_LEVEL_OFF and not bool(meta.get("thinking_enabled")):
        warnings.append(
            f"Thinking level '{resolved_thinking_level}' was requested for provider '{provider_id}', but TooGraph did not find a native thinking field for this provider/model."
        )
    if structured_output_schema and not meta.get("structured_output_strategy"):
        meta["structured_output_strategy"] = "prompt_validation"
    if structured_output_schema:
        meta["structured_output_mode"] = resolved_structured_output_mode
    _ensure_provider_prompt_cache_result(meta, normalized_transport, prompt_cache_policy)
    meta["warnings"] = warnings
    meta.setdefault("thinking_enabled", False)
    meta.setdefault("thinking_level", resolved_thinking_level)
    meta.setdefault("reasoning_format", None)
    meta["base_url"] = normalized_base_url
    meta["request_timeout_seconds"] = normalized_timeout_seconds
    return content, meta


def _invoke_with_video_auto_fallback(
    invoke: Callable[[list[dict[str, Any]] | None, dict[str, Any] | None], tuple[str, dict[str, Any]]],
    *,
    input_attachments: list[dict[str, Any]] | None,
    transport: str,
    structured_output_schema: dict[str, Any] | None,
) -> tuple[str, dict[str, Any]]:
    try:
        return invoke(input_attachments, structured_output_schema)
    except Exception as exc:
        if not should_fallback_video_to_frames(exc, input_attachments):
            raise
        with tempfile.TemporaryDirectory(prefix="toograph_video_fallback_") as temp_dir:
            fallback_attachments, fallback_meta = build_video_frame_fallback_attachments(
                input_attachments,
                output_dir=temp_dir,
            )
            fallback_attachments = _prepare_request_attachments_for_transport(transport, fallback_attachments)
            try:
                content, meta = invoke(fallback_attachments, structured_output_schema)
            except Exception as fallback_exc:
                raise RuntimeError(
                    f"Native video request failed, and frame fallback also failed: {fallback_exc}"
                ) from fallback_exc
        meta["video_fallback"] = fallback_meta
        meta["_video_fallback_warning"] = f"Native video request failed; analyzed extracted frames instead. {exc}"
        return content, meta


def _is_lmstudio_native_schema_reasoning_conflict(
    *,
    provider_id: str,
    structured_output_mode: str,
    structured_output_schema: dict[str, Any] | None,
    content: str,
    meta: dict[str, Any],
) -> bool:
    return is_lmstudio_native_schema_reasoning_conflict(
        provider_id=provider_id,
        structured_output_mode=structured_output_mode,
        structured_output_schema=structured_output_schema,
        content=content,
        reasoning=str(meta.get("reasoning") or ""),
    )


def _prepare_request_attachments_for_transport(
    transport: str,
    input_attachments: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    if transport in {TRANSPORT_OPENAI_COMPATIBLE, TRANSPORT_CODEX_RESPONSES}:
        return inline_provider_image_attachments(input_attachments)
    return input_attachments


def _ensure_provider_prompt_cache_result(
    meta: dict[str, Any],
    transport: str,
    prompt_cache_policy: dict[str, Any] | None,
) -> None:
    if not isinstance(prompt_cache_policy, dict):
        return
    if str(prompt_cache_policy.get("requested_policy") or "").strip().lower() != "prefer":
        return
    if isinstance(meta.get("provider_prompt_cache_result"), dict):
        return

    result: dict[str, Any] = {
        "kind": "provider_prompt_cache_result",
        "version": 1,
        "requested_policy": "prefer",
        "eligible": bool(prompt_cache_policy.get("eligible")),
    }
    for key in ("stable_prefix_hash", "cache_key"):
        value = prompt_cache_policy.get(key)
        if isinstance(value, str) and value.strip():
            result[key] = value.strip()
    if not prompt_cache_policy.get("eligible"):
        result.update(
            {
                "mode": "not_applied",
                "provider_cache_control": "not_applied",
                "reason": str(prompt_cache_policy.get("reason") or "prompt_cache_policy_ineligible"),
            }
        )
    elif transport != TRANSPORT_ANTHROPIC_MESSAGES:
        result.update(
            {
                "mode": "not_supported",
                "provider_cache_control": "not_supported",
                "reason": "provider_prompt_cache_control_not_supported",
            }
        )
    else:
        result.update(
            {
                "mode": "not_applied",
                "provider_cache_control": "not_applied",
                "reason": "anthropic_prompt_cache_control_not_applied",
            }
        )
    meta["provider_prompt_cache_result"] = result


def _split_model_ref(model_ref: str) -> tuple[str, str]:
    provider_id, model_name = model_ref.split("/", 1) if "/" in model_ref else ("local", model_ref)
    return provider_id.strip() or "local", model_name.strip()


def _provider_config_from_saved(
    provider_id: str,
    saved_providers: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    saved_provider = saved_providers.get(provider_id) if isinstance(saved_providers, dict) else {}
    saved_provider = saved_provider if isinstance(saved_provider, dict) else {}
    template = get_provider_template(provider_id)
    return template, {**template, **saved_provider}


def _provider_auth_scheme(provider_config: dict[str, Any], template: dict[str, Any]) -> str:
    auth_scheme = (
        provider_config.get("auth_scheme")
        if provider_config.get("auth_scheme") is not None
        else template.get("auth_scheme", "Bearer")
    )
    return str(auth_scheme or "")


def _provider_request_timeout_seconds(
    provider_config: dict[str, Any],
    template: dict[str, Any],
    *,
    override: float | None = None,
) -> float:
    return normalize_request_timeout_seconds(
        override
        if override is not None
        else provider_config.get("request_timeout_seconds") or template.get("request_timeout_seconds")
    )


def _provider_model_capabilities(provider_config: dict[str, Any], model_name: str) -> dict[str, bool]:
    models = provider_config.get("models")
    if not isinstance(models, list):
        return {}
    target = str(model_name or "").strip().lower()
    for item in models:
        if not isinstance(item, dict):
            continue
        if str(item.get("model") or "").strip().lower() != target:
            continue
        capabilities = item.get("capabilities")
        if not isinstance(capabilities, dict):
            return {}
        return {
            str(key).strip(): bool(value)
            for key, value in capabilities.items()
            if str(key or "").strip()
        }
    return {}


def _effective_prompt_cache_policy_for_provider_model(
    prompt_cache_policy: dict[str, Any] | None,
    *,
    provider_id: str,
    transport: str,
    provider_config: dict[str, Any],
    model_name: str,
) -> dict[str, Any] | None:
    if not isinstance(prompt_cache_policy, dict):
        return prompt_cache_policy
    if str(provider_id or "").strip().lower() == "openai":
        return prompt_cache_policy
    if normalize_transport(str(transport or TRANSPORT_OPENAI_COMPATIBLE)) != TRANSPORT_OPENAI_COMPATIBLE:
        return prompt_cache_policy
    capabilities = _provider_model_capabilities(provider_config, model_name)
    if not bool(capabilities.get("prompt_cache")):
        return prompt_cache_policy
    return {
        **prompt_cache_policy,
        "openai_compatible_prompt_cache_key": True,
    }


def _resolve_model_runtime_fixture_result(
    model_ref: str,
    model_runtime_fixture: dict[str, Any] | None,
    *,
    system_prompt: str = "",
    user_prompt: str = "",
) -> dict[str, Any]:
    fixture = model_runtime_fixture if isinstance(model_runtime_fixture, dict) else {}
    failure = _model_runtime_fixture_record(
        fixture.get("failures"),
        model_ref,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )
    if failure:
        return {"kind": "failure", **failure}
    response = _model_runtime_fixture_record(
        fixture.get("responses"),
        model_ref,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )
    if response:
        return {"kind": "response", **response}
    return {}


def _model_runtime_fixture_record(
    records: Any,
    model_ref: str,
    *,
    system_prompt: str = "",
    user_prompt: str = "",
) -> dict[str, Any]:
    if isinstance(records, dict):
        record = records.get(model_ref)
        return dict(record) if isinstance(record, dict) else {}
    if not isinstance(records, list):
        return {}
    provider_id, model = _split_model_ref(model_ref)
    for item in records:
        if not isinstance(item, dict):
            continue
        item_model_ref = str(item.get("model_ref") or "").strip()
        item_provider_id = str(item.get("provider_id") or "").strip()
        item_model = str(item.get("model") or "").strip()
        has_model_target = bool(item_model_ref or item_provider_id or item_model)
        if has_model_target and not (
            item_model_ref == model_ref or (item_provider_id == provider_id and item_model == model)
        ):
            continue
        if not _model_runtime_fixture_prompt_matches(
            item,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
        ):
            continue
        return dict(item)
    return {}


def _model_runtime_fixture_prompt_matches(
    record: dict[str, Any],
    *,
    system_prompt: str,
    user_prompt: str,
) -> bool:
    prompt = f"{system_prompt}\n{user_prompt}"
    return (
        _fixture_terms_match(record.get("system_contains"), system_prompt)
        and _fixture_terms_match(record.get("user_contains"), user_prompt)
        and _fixture_terms_match(record.get("prompt_contains"), prompt)
    )


def _fixture_terms_match(raw_terms: Any, haystack: str) -> bool:
    if raw_terms in (None, "", []):
        return True
    terms = raw_terms if isinstance(raw_terms, list) else [raw_terms]
    return all(str(term or "") in haystack for term in terms if str(term or ""))


def _model_runtime_fixture_failure(failure: dict[str, Any], model_ref: str) -> Exception:
    message = str(failure.get("message") or failure.get("error") or f"Model runtime fixture failed {model_ref}.")
    error_type = str(failure.get("error_type") or "").strip()
    if error_type == "provider_timeout":
        return httpx.TimeoutException(message)
    return RuntimeError(message)


def _model_runtime_fixture_response(response: dict[str, Any], model_ref: str) -> tuple[str, dict[str, Any]]:
    provider_id, model = _split_model_ref(model_ref)
    content = str(response.get("content") or response.get("text") or "")
    meta = dict(response.get("meta")) if isinstance(response.get("meta"), dict) else {}
    meta.setdefault("provider_id", provider_id)
    meta.setdefault("model", model)
    meta.setdefault("warnings", [])
    meta["model_runtime_fixture_used"] = True
    return content, meta


def _chat_with_model_ref_once(
    *,
    model_ref: str,
    saved_providers: dict[str, Any],
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None,
    thinking_enabled: bool,
    thinking_level: str | None,
    on_delta: Callable[[str], None] | None,
    input_attachments: list[dict[str, Any]] | None,
    structured_output_schema: dict[str, Any] | None,
    structured_output_mode: str | None = None,
    model_runtime_fixture: dict[str, Any] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    provider_cost_budget: dict[str, Any] | None = None,
    provider_cost_budget_approval: dict[str, Any] | None = None,
    provider_cost_budget_degradation: dict[str, Any] | None = None,
    provider_rate_profile: dict[str, Any] | None = None,
    request_timeout_seconds: float | None = None,
    tools: list[dict[str, Any]] | None = None,
    persist_credential_state: bool = True,
) -> tuple[str, dict[str, Any]]:
    provider_id, model_name = _split_model_ref(model_ref)
    current_model_ref = f"{provider_id}/{model_name}".strip("/")
    fixture_result = _resolve_model_runtime_fixture_result(
        model_ref,
        model_runtime_fixture,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
    )
    if fixture_result.get("kind") == "failure":
        raise _model_runtime_fixture_failure(fixture_result, model_ref)
    if fixture_result.get("kind") == "response":
        return _model_runtime_fixture_response(fixture_result, model_ref)

    template, provider_config = _provider_config_from_saved(provider_id, saved_providers)
    effective_structured_output_mode = normalize_structured_output_mode(
        structured_output_mode or provider_config.get("structured_output_mode")
    )

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
            input_attachments=input_attachments,
            structured_output_schema=structured_output_schema,
            structured_output_mode=effective_structured_output_mode,
            request_timeout_seconds=request_timeout_seconds,
            tools=tools,
        )

    transport = str(provider_config.get("transport") or template["transport"])
    effective_prompt_cache_policy = _effective_prompt_cache_policy_for_provider_model(
        prompt_cache_policy,
        provider_id=provider_id,
        transport=transport,
        provider_config=provider_config,
        model_name=model_name,
    )
    api_key, provider_credential = select_provider_credential(provider_config)
    provider_pricing = provider_model_pricing(provider_config, model_name)
    provider_context: dict[str, Any] = {}
    if provider_credential:
        provider_context["provider_credential"] = provider_credential
    if provider_pricing:
        provider_context["provider_pricing"] = provider_pricing
    if isinstance(provider_cost_budget, dict) and provider_cost_budget:
        provider_context["provider_cost_budget"] = dict(provider_cost_budget)
    if isinstance(provider_cost_budget_approval, dict) and provider_cost_budget_approval:
        provider_context["provider_cost_budget_approval"] = dict(provider_cost_budget_approval)
    if isinstance(provider_cost_budget_degradation, dict) and provider_cost_budget_degradation:
        provider_context["provider_cost_budget_degradation"] = dict(provider_cost_budget_degradation)
    if isinstance(provider_rate_profile, dict) and provider_rate_profile:
        provider_context["provider_rate_profile"] = dict(provider_rate_profile)
    _enforce_provider_cost_budget_preflight(
        provider_context,
        provider_cost_budget,
        provider_cost_budget_approval,
        provider_cost_budget_degradation,
        model_ref=current_model_ref,
    )
    provider_rate_reservation = _enforce_provider_rate_profile_preflight(
        {**provider_context, "provider_id": provider_id, "model": model_name},
        provider_rate_profile,
        estimated_request_tokens=_estimate_provider_request_tokens(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            input_attachments=input_attachments,
            structured_output_schema=structured_output_schema,
        ),
    )
    if provider_rate_reservation:
        provider_context["provider_rate_reservation"] = dict(provider_rate_reservation)
    provider_rate_concurrency_slot = _provider_rate_concurrency_slot(
        provider_id=provider_id,
        model=model_name,
        provider_rate_profile=provider_rate_profile,
    )
    provider_credential_state_update: dict[str, Any] = {}
    provider_rate_reservation_release: dict[str, Any] = {}
    try:
        with provider_rate_concurrency_slot:
            with use_model_call_context(**provider_context) if provider_context else nullcontext():
                content, meta = chat_with_model_provider(
                    provider_id=provider_id,
                    transport=transport,
                    base_url=str(provider_config.get("base_url") or template["base_url"]),
                    api_key=api_key,
                    model=model_name,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    thinking_enabled=thinking_enabled,
                    thinking_level=thinking_level,
                    auth_header=str(provider_config.get("auth_header") or template.get("auth_header") or "Authorization"),
                    auth_scheme=_provider_auth_scheme(provider_config, template),
                    request_timeout_seconds=_provider_request_timeout_seconds(
                        provider_config,
                        template,
                        override=request_timeout_seconds,
                    ),
                    on_delta=on_delta,
                    input_attachments=input_attachments,
                    structured_output_schema=structured_output_schema,
                    structured_output_mode=effective_structured_output_mode,
                    prompt_cache_policy=effective_prompt_cache_policy,
                    tools=tools,
                )
                _annotate_last_model_request_log_with_provider_cache(meta)
    except ProviderRateProfileExceeded:
        raise
    except Exception:
        _record_provider_credential_call_result(
            provider_id=provider_id,
            provider_credential=provider_credential,
            success=False,
            persist_credential_state=persist_credential_state,
        )
        raise
    finally:
        provider_rate_reservation_release = _release_provider_rate_profile_reservation(provider_rate_reservation)
    provider_credential_state_update = _record_provider_credential_call_result(
        provider_id=provider_id,
        provider_credential=provider_credential,
        success=True,
        persist_credential_state=persist_credential_state,
    )
    if provider_credential:
        meta = {**meta, "provider_credential": provider_credential}
    if provider_credential_state_update:
        meta = {**meta, "provider_credential_state_update": provider_credential_state_update}
    provider_rate_reservation_meta = _provider_rate_reservation_meta(
        provider_rate_reservation,
        provider_rate_reservation_release,
    )
    if provider_rate_reservation_meta:
        meta = {**meta, "provider_rate_reservation": provider_rate_reservation_meta}
    if isinstance(provider_cost_budget_approval, dict) and provider_cost_budget_approval:
        meta = {**meta, "provider_cost_budget_approval": dict(provider_cost_budget_approval)}
    if isinstance(provider_cost_budget_degradation, dict) and provider_cost_budget_degradation:
        meta = {**meta, "provider_cost_budget_degradation": dict(provider_cost_budget_degradation)}
    if "provider_cost_estimate" not in meta:
        provider_cost_estimate = build_provider_cost_estimate(meta.get("usage"), provider_pricing, provider_cost_budget)
        if provider_cost_estimate:
            meta = {**meta, "provider_cost_estimate": provider_cost_estimate}
    if "provider_rate_decision" not in meta:
        provider_rate_decision = build_provider_rate_decision(meta.get("usage"), provider_rate_profile)
        if provider_rate_decision:
            meta = {**meta, "provider_rate_decision": provider_rate_decision}
    return content, meta


def _provider_requires_api_key(provider_id: str, provider_config: dict[str, Any]) -> bool:
    if provider_id == "local":
        return False
    if provider_config.get("auth_mode") == "chatgpt":
        return False
    base_url = str(provider_config.get("base_url") or "").lower()
    if "localhost" in base_url or "127.0.0.1" in base_url or base_url.startswith("http://0.0.0.0"):
        return False
    return True


def _enforce_provider_cost_budget_preflight(
    provider_context: dict[str, Any],
    provider_cost_budget: Any,
    provider_cost_budget_approval: Any = None,
    provider_cost_budget_degradation: Any = None,
    *,
    model_ref: str = "",
) -> None:
    if not isinstance(provider_cost_budget, dict) or not provider_cost_budget:
        return
    if _provider_cost_budget_approval_allows_overrun(provider_cost_budget_approval):
        return
    if _provider_cost_budget_degradation_allows_model(provider_cost_budget_degradation, model_ref):
        return
    call_context = {**get_model_call_context(), **provider_context}
    decision = evaluate_provider_cost_budget_preflight(call_context, provider_cost_budget)
    if decision.get("status") == "blocked":
        raise ProviderCostBudgetExceeded(decision)


def _provider_cost_budget_approval_allows_overrun(approval: Any) -> bool:
    if not isinstance(approval, dict):
        return False
    if str(approval.get("approval_type") or "") != "provider_cost_budget":
        return False
    return str(approval.get("status") or "").lower() == "approved"


def _provider_cost_budget_degradation_allows_model(degradation: Any, model_ref: str) -> bool:
    if not isinstance(degradation, dict):
        return False
    if str(degradation.get("kind") or "") != "provider_cost_budget_degradation":
        return False
    if str(degradation.get("status") or "").lower() != "applied":
        return False
    selected_model_ref = str(degradation.get("selected_model_ref") or "").strip()
    return bool(selected_model_ref and selected_model_ref == str(model_ref or "").strip())


def _provider_cost_budget_degradation_enabled(provider_cost_budget: Any) -> bool:
    if not isinstance(provider_cost_budget, dict):
        return False
    return str(provider_cost_budget.get("on_exceeded") or provider_cost_budget.get("onExceeded") or "").strip() == "degrade_model"


def _provider_cost_budget_degradation_record(
    *,
    preflight_decision: dict[str, Any],
    requested_model_ref: str,
    selected_model_ref: str,
) -> dict[str, Any]:
    return {
        "kind": "provider_cost_budget_degradation",
        "version": 1,
        "status": "applied",
        "reason": "provider_cost_budget_degradation_selected",
        "requested_model_ref": requested_model_ref,
        "selected_model_ref": selected_model_ref,
        "provider_cost_budget_preflight": dict(preflight_decision),
    }


def _enforce_provider_rate_profile_preflight(
    provider_context: dict[str, Any],
    provider_rate_profile: Any,
    *,
    estimated_request_tokens: int | None = None,
) -> dict[str, Any]:
    if not isinstance(provider_rate_profile, dict) or not provider_rate_profile:
        return {}
    profile = normalize_provider_rate_profile(provider_rate_profile)
    call_context = {**get_model_call_context(), **provider_context}
    decision = evaluate_provider_rate_profile_preflight(
        call_context,
        provider_rate_profile,
        estimated_request_tokens=estimated_request_tokens,
    )
    if decision.get("status") != "blocked":
        reservation, blocked_decision = _provider_rate_reservation_or_blocked_decision(
            call_context,
            provider_rate_profile,
            estimated_request_tokens=estimated_request_tokens,
        )
        if blocked_decision is None:
            return reservation
        decision = blocked_decision
    waited_seconds = 0.0
    wait_attempts = 0
    with _provider_rate_wait_queue_turn(provider_context, profile):
        while True:
            remaining_wait_seconds = _provider_rate_remaining_wait_seconds(profile, waited_seconds)
            wait_seconds = _provider_rate_wait_seconds(
                profile,
                decision,
                remaining_wait_seconds=remaining_wait_seconds,
            )
            if wait_seconds is None or wait_attempts >= _PROVIDER_RATE_WAIT_MAX_ATTEMPTS:
                raise ProviderRateProfileExceeded(decision)
            wait_attempts += 1
            waited_seconds += wait_seconds
            _sleep(wait_seconds)
            decision = evaluate_provider_rate_profile_preflight(
                call_context,
                provider_rate_profile,
                estimated_request_tokens=estimated_request_tokens,
            )
            if decision.get("status") != "blocked":
                reservation, blocked_decision = _provider_rate_reservation_or_blocked_decision(
                    call_context,
                    provider_rate_profile,
                    estimated_request_tokens=estimated_request_tokens,
                )
                if blocked_decision is None:
                    return reservation
                decision = blocked_decision


def _estimate_provider_request_tokens(
    *,
    system_prompt: str,
    user_prompt: str,
    input_attachments: list[dict[str, Any]] | None,
    structured_output_schema: dict[str, Any] | None,
) -> int:
    estimated_chars = len(str(system_prompt or "")) + len(str(user_prompt or ""))
    estimated_chars += _estimated_text_payload_chars(input_attachments)
    estimated_chars += _estimated_text_payload_chars(structured_output_schema)
    if estimated_chars <= 0:
        return 0
    return max(1, (estimated_chars + 3) // 4)


def _estimated_text_payload_chars(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        if value.startswith("data:") or value.startswith("file://"):
            return 0
        return len(value)
    if isinstance(value, dict):
        total = 0
        for key, item in value.items():
            key_text = str(key or "")
            if key_text in {"data", "url", "image", "video", "audio"} and isinstance(item, str):
                total += len(key_text)
                continue
            total += len(key_text) + _estimated_text_payload_chars(item)
        return total
    if isinstance(value, list):
        return sum(_estimated_text_payload_chars(item) for item in value)
    try:
        return len(json.dumps(value, ensure_ascii=False, sort_keys=True))
    except (TypeError, ValueError):
        return len(str(value))


def _provider_rate_remaining_wait_seconds(profile: dict[str, Any], waited_seconds: float) -> float | None:
    max_wait_seconds = _positive_float_or_zero(profile.get("max_wait_seconds"))
    if max_wait_seconds is None:
        return None
    return max(0.0, max_wait_seconds - waited_seconds)


def _provider_rate_reservation_or_blocked_decision(
    call_context: dict[str, Any],
    provider_rate_profile: Any,
    *,
    estimated_request_tokens: int | None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    reservation = reserve_provider_rate_profile_capacity(
        call_context,
        provider_rate_profile,
        estimated_request_tokens=estimated_request_tokens,
    )
    if reservation.get("kind") == "provider_rate_reservation" and reservation.get("status") == "reserved":
        return reservation, None
    if reservation.get("status") == "blocked":
        return {}, reservation
    return {}, None


def _release_provider_rate_profile_reservation(reservation: dict[str, Any]) -> dict[str, Any]:
    reservation_id = str(reservation.get("reservation_id") or "").strip() if isinstance(reservation, dict) else ""
    if reservation_id:
        return release_provider_rate_reservation(reservation_id)
    return {}


def _provider_rate_reservation_meta(reservation: dict[str, Any], release_result: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(reservation, dict) or not reservation:
        return {}
    result = dict(reservation)
    if isinstance(release_result, dict) and release_result:
        result["status"] = str(release_result.get("status") or result.get("status") or "")
        if release_result.get("released_at"):
            result["released_at"] = release_result["released_at"]
    return result


@contextmanager
def _provider_rate_wait_queue_turn(provider_context: dict[str, Any], profile: dict[str, Any]) -> Iterator[None]:
    queue_key = _provider_rate_wait_queue_key(provider_context, profile)
    if queue_key is None:
        yield
        return
    call_context = {**get_model_call_context(), **provider_context}
    queue_entry = enqueue_provider_rate_wait_queue_entry(
        queue_key,
        call_context,
        ttl_seconds=_provider_rate_wait_queue_ttl_seconds(profile),
    )
    queue_entry_id = str(queue_entry.get("queue_entry_id") or "").strip()
    if not queue_entry_id:
        yield
        return
    try:
        while True:
            turn = claim_provider_rate_wait_queue_turn(queue_entry_id)
            turn_status = str(turn.get("status") or "").strip() if isinstance(turn, dict) else ""
            if turn_status == "acquired":
                break
            if not turn or turn_status in {"expired", "released"}:
                raise ProviderRateProfileExceeded(
                    {
                        "kind": "provider_rate_wait_queue",
                        "status": "blocked",
                        "reason": "provider_rate_wait_queue_turn_unavailable",
                        "queue_entry_id": queue_entry_id,
                        "queue_key": queue_key,
                    }
                )
            with _PROVIDER_RATE_WAIT_QUEUE_CONDITION:
                _PROVIDER_RATE_WAIT_QUEUE_CONDITION.wait(timeout=_PROVIDER_RATE_WAIT_QUEUE_POLL_SECONDS)
        yield
    finally:
        release_provider_rate_wait_queue_entry(queue_entry_id)
        with _PROVIDER_RATE_WAIT_QUEUE_CONDITION:
            _PROVIDER_RATE_WAIT_QUEUE_CONDITION.notify_all()


def _provider_rate_wait_queue_key(provider_context: dict[str, Any], profile: dict[str, Any]) -> str | None:
    if profile.get("wait_strategy") != "wait":
        return None
    provider_id = str(provider_context.get("provider_id") or "").strip()
    if not provider_id:
        return None
    return f"provider:{provider_id}"


def _provider_rate_wait_queue_ttl_seconds(profile: dict[str, Any]) -> int:
    max_wait_seconds = _positive_float_or_zero(profile.get("max_wait_seconds"))
    if max_wait_seconds is None:
        return 120
    return max(1, int(max_wait_seconds + 60))


def _provider_rate_wait_seconds(
    profile: dict[str, Any],
    decision: dict[str, Any],
    *,
    remaining_wait_seconds: float | None = None,
) -> float | None:
    if profile.get("wait_strategy") != "wait":
        return None
    retry_after_seconds = _positive_float_or_zero(decision.get("retry_after_seconds"))
    if retry_after_seconds is None:
        return None
    wait_budget_seconds = (
        remaining_wait_seconds
        if remaining_wait_seconds is not None
        else _positive_float_or_zero(profile.get("max_wait_seconds"))
    )
    if wait_budget_seconds is None or retry_after_seconds > wait_budget_seconds:
        return None
    return retry_after_seconds


def _positive_float_or_zero(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number < 0:
        return None
    return number


@contextmanager
def _provider_rate_concurrency_slot(
    *,
    provider_id: str,
    model: str,
    provider_rate_profile: Any,
) -> Iterator[None]:
    profile = normalize_provider_rate_profile(provider_rate_profile)
    concurrency_limit = profile.get("concurrency")
    if concurrency_limit is None:
        yield
        return

    scope_provider_id = str(provider_id or "").strip() or "unknown"
    normalized_model = str(model or "").strip()
    with _PROVIDER_RATE_CONCURRENCY_LOCK:
        observed_concurrency = int(_PROVIDER_RATE_CONCURRENCY_ACTIVE.get(scope_provider_id) or 0)
        if observed_concurrency >= concurrency_limit:
            raise ProviderRateProfileExceeded(
                {
                    "kind": "provider_rate_profile_concurrency_gate",
                    "version": 1,
                    "mode": "enforce_in_process_concurrency",
                    "status": "blocked",
                    "reason": "provider_rate_profile_concurrency_exhausted",
                    **profile,
                    "observed_concurrency": observed_concurrency,
                    "limit_exceeded": ["concurrency"],
                    "scope": {
                        "provider_id": scope_provider_id,
                        "model": normalized_model,
                    },
                }
            )
        _PROVIDER_RATE_CONCURRENCY_ACTIVE[scope_provider_id] = observed_concurrency + 1

    try:
        yield
    finally:
        with _PROVIDER_RATE_CONCURRENCY_LOCK:
            current_concurrency = int(_PROVIDER_RATE_CONCURRENCY_ACTIVE.get(scope_provider_id) or 0)
            if current_concurrency <= 1:
                _PROVIDER_RATE_CONCURRENCY_ACTIVE.pop(scope_provider_id, None)
            else:
                _PROVIDER_RATE_CONCURRENCY_ACTIVE[scope_provider_id] = current_concurrency - 1


def _record_provider_credential_call_result(
    *,
    provider_id: str,
    provider_credential: dict[str, Any],
    success: bool,
    persist_credential_state: bool,
) -> dict[str, Any]:
    if not persist_credential_state:
        return {}
    credential_id = str(provider_credential.get("credential_id") or "").strip()
    if not credential_id or provider_credential.get("source") != "credential_pool":
        return {}
    settings = load_app_settings()
    updated_settings, event = update_provider_credential_pool_after_call(
        settings,
        provider_id=provider_id,
        credential_id=credential_id,
        success=success,
    )
    if event:
        save_app_settings(updated_settings)
    return event


def _provider_configured(provider_id: str, provider_config: dict[str, Any]) -> bool:
    if not str(provider_config.get("base_url") or "").strip():
        return False
    if _provider_requires_api_key(provider_id, provider_config) and not has_configured_provider_credential(provider_config):
        return False
    return True


def _provider_enabled(provider_id: str, provider_config: dict[str, Any], saved_provider: dict[str, Any]) -> bool:
    if "enabled" in saved_provider and isinstance(saved_provider.get("enabled"), bool):
        return bool(saved_provider.get("enabled"))
    if not saved_provider and isinstance(provider_config.get("enabled"), bool):
        return bool(provider_config.get("enabled"))
    return bool(saved_provider) and provider_id != "bedrock"


def _string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []
    if not isinstance(value, list):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _model_item_name(item: Any) -> str:
    if isinstance(item, dict):
        return str(item.get("model") or item.get("id") or item.get("name") or "").strip()
    return str(item or "").strip()


def _model_item_capabilities(item: Any) -> dict[str, bool]:
    capabilities: dict[str, bool] = {
        "chat": True,
        "structured_output": True,
    }
    record = item if isinstance(item, dict) else {}
    raw_capabilities = record.get("capabilities")
    if isinstance(raw_capabilities, dict):
        capabilities.update({str(key): bool(value) for key, value in raw_capabilities.items()})
    elif isinstance(raw_capabilities, list):
        capabilities.update({str(value): True for value in raw_capabilities if str(value or "").strip()})

    modalities = _string_list(record.get("modalities") or record.get("input"))
    normalized_modalities = {modality.lower() for modality in modalities}
    if normalized_modalities & {"image", "images", "vision", "video", "multimodal"}:
        capabilities["vision"] = True
    return capabilities


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _model_item_permissions(item: Any, provider_config: dict[str, Any], default_permissions: list[str]) -> list[str]:
    record = item if isinstance(item, dict) else {}
    return (
        _string_list(record.get("permissions"))
        or _string_list(provider_config.get("permissions"))
        or default_permissions
    )


def _provider_fallback_candidates(
    *,
    requested_provider_id: str,
    requested_model_name: str,
    saved_providers: dict[str, Any],
    default_permissions: list[str] | None = None,
) -> list[dict[str, Any]]:
    normalized_default_permissions = default_permissions or ["text_generation"]
    provider_ids: list[str] = []
    for provider_id in [requested_provider_id, *list(saved_providers.keys())]:
        normalized_provider_id = str(provider_id or "").strip()
        if normalized_provider_id and normalized_provider_id not in provider_ids:
            provider_ids.append(normalized_provider_id)

    candidates: list[dict[str, Any]] = []
    for provider_index, provider_id in enumerate(provider_ids):
        saved_provider = saved_providers.get(provider_id) if isinstance(saved_providers.get(provider_id), dict) else {}
        template, provider_config = _provider_config_from_saved(provider_id, saved_providers)
        model_items = provider_config.get("models") if isinstance(provider_config.get("models"), list) else []
        if not model_items and provider_id == requested_provider_id and requested_model_name:
            model_items = [{"model": requested_model_name}]
        for model_index, item in enumerate(model_items):
            model_name = _model_item_name(item)
            if not model_name:
                continue
            candidates.append(
                {
                    "model_ref": f"{provider_id}/{model_name}",
                    "provider_id": provider_id,
                    "model": model_name,
                    "enabled": _provider_enabled(provider_id, provider_config, saved_provider),
                    "configured": _provider_configured(provider_id, provider_config),
                    "capabilities": _model_item_capabilities(item),
                    "permissions": _model_item_permissions(item, provider_config, normalized_default_permissions),
                    "priority": provider_index * 1000 + model_index,
                    "transport": str(provider_config.get("transport") or template.get("transport") or ""),
                }
            )
    return candidates


def _required_chat_capabilities(
    *,
    input_attachments: list[dict[str, Any]] | None,
    structured_output_schema: dict[str, Any] | None,
) -> list[str]:
    capabilities = ["chat"]
    if structured_output_schema:
        capabilities.append("structured_output")
    if any(
        str(attachment.get("type") or "").strip().lower() in {"image", "video"}
        for attachment in input_attachments or []
        if isinstance(attachment, dict)
    ):
        capabilities.append("vision")
    return capabilities


def _provider_failure_event(
    *,
    model_ref: str,
    provider_id: str,
    model_name: str,
    exc: Exception,
) -> dict[str, str]:
    message = str(exc)
    lowered_message = message.lower()
    if isinstance(exc, ProviderCostBudgetExceeded):
        error_type = "provider_cost_budget_exceeded"
    elif isinstance(exc, httpx.TimeoutException) or "timeout" in lowered_message or "timed out" in lowered_message:
        error_type = "provider_timeout"
    elif isinstance(exc, httpx.HTTPStatusError):
        error_type = "provider_http_error"
    else:
        error_type = "provider_runtime_error"
    return {
        "model_ref": model_ref,
        "provider_id": provider_id,
        "model": model_name,
        "error_type": error_type,
        "message": message,
    }


def _runtime_fallback_trace(fallback_result: dict[str, Any]) -> dict[str, Any]:
    raw_trace = fallback_result.get("provider_fallback_trace")
    trace = dict(raw_trace) if isinstance(raw_trace, dict) else {}
    for key in ("failed_candidates", "fallback_candidates", "rejected_candidates", "warnings"):
        value = trace.get(key)
        trace[key] = list(value) if isinstance(value, list) else []
    trace["attempts"] = [
        {
            "model_ref": str(candidate.get("model_ref") or "").strip(),
            "provider_id": str(candidate.get("provider_id") or "").strip(),
            "model": str(candidate.get("model") or "").strip(),
            "status": "failed",
            "error_type": str(candidate.get("error_type") or "").strip(),
        }
        for candidate in trace["failed_candidates"]
        if isinstance(candidate, dict)
    ]
    return trace


def _fallback_candidate_model_refs(
    fallback_result: dict[str, Any],
    trace: dict[str, Any],
    requested_model_ref: str,
) -> list[str]:
    candidates: list[str] = []
    selected_model_ref = str(fallback_result.get("selected_model_ref") or "").strip()
    if selected_model_ref:
        candidates.append(selected_model_ref)
    for candidate in trace.get("fallback_candidates", []):
        if not isinstance(candidate, dict):
            continue
        candidate_model_ref = str(candidate.get("model_ref") or "").strip()
        if candidate_model_ref:
            candidates.append(candidate_model_ref)

    result: list[str] = []
    seen: set[str] = {requested_model_ref}
    for candidate_model_ref in candidates:
        if candidate_model_ref in seen:
            continue
        seen.add(candidate_model_ref)
        result.append(candidate_model_ref)
    return result


def _append_failed_fallback_attempt(trace: dict[str, Any], model_ref: str, exc: Exception) -> None:
    provider_id, model_name = _split_model_ref(model_ref)
    failure = _provider_failure_event(
        model_ref=model_ref,
        provider_id=provider_id,
        model_name=model_name,
        exc=exc,
    )
    failed_candidate = {
        "provider_id": failure["provider_id"],
        "model": failure["model"],
        "model_ref": failure["model_ref"],
        "status": "failed",
        "reason": "fallback_provider_failed",
        "error_type": failure["error_type"],
        "message": failure["message"],
    }
    trace.setdefault("failed_candidates", []).append(failed_candidate)
    trace.setdefault("attempts", []).append(
        {
            "model_ref": failure["model_ref"],
            "provider_id": failure["provider_id"],
            "model": failure["model"],
            "status": "failed",
            "error_type": failure["error_type"],
        }
    )
    trace.setdefault("warnings", []).append(f"Fallback provider '{model_ref}' failed: {failure['message']}")


def _append_selected_fallback_attempt(trace: dict[str, Any], model_ref: str) -> None:
    provider_id, model_name = _split_model_ref(model_ref)
    selected = {
        "provider_id": provider_id,
        "model": model_name,
        "model_ref": model_ref,
        "reason": "fallback_after_provider_failed",
    }
    trace["selected"] = selected
    trace["decision"] = "fallback_selected"
    trace["fallback_used"] = True
    trace.setdefault("attempts", []).append(
        {
            "model_ref": model_ref,
            "provider_id": provider_id,
            "model": model_name,
            "status": "selected",
        }
    )


def _annotate_last_model_request_log_with_provider_fallback(trace: dict[str, Any], selected_model_ref: str) -> None:
    last_entry = _LAST_MODEL_REQUEST_LOG.get({})
    model_call_id = str(last_entry.get("id") or "").strip()
    if not model_call_id:
        return
    provider_id, model_name = _split_model_ref(selected_model_ref)
    if str(last_entry.get("provider_id") or "").strip() != provider_id:
        return
    if str(last_entry.get("model") or "").strip() != model_name:
        return
    update_model_request_log_metadata(model_call_id, {"provider_fallback_trace": trace})


def _annotate_last_model_request_log_with_provider_cache(meta: dict[str, Any]) -> None:
    provider_cache_result = meta.get("provider_prompt_cache_result") if isinstance(meta, dict) else None
    if not isinstance(provider_cache_result, dict) or not provider_cache_result:
        return
    last_entry = _LAST_MODEL_REQUEST_LOG.get({})
    model_call_id = str(last_entry.get("id") or "").strip()
    if not model_call_id:
        return
    provider_id = str(meta.get("provider_id") or "").strip()
    if provider_id and str(last_entry.get("provider_id") or "").strip() != provider_id:
        return
    update_model_request_log_metadata(model_call_id, {"provider_cache_decision": provider_cache_result})


def _with_provider_fallback_meta(
    meta: dict[str, Any],
    *,
    trace: dict[str, Any],
    requested_model_ref: str,
    selected_model_ref: str,
    primary_error: Exception,
) -> dict[str, Any]:
    fallback_meta = dict(meta)
    warnings = [str(warning) for warning in fallback_meta.get("warnings", []) if str(warning or "").strip()]
    warnings.append(
        f"Provider fallback used: '{requested_model_ref}' failed; used '{selected_model_ref}'. {primary_error}"
    )
    fallback_meta["warnings"] = warnings
    fallback_meta["provider_fallback_used"] = True
    fallback_meta["requested_model_ref"] = requested_model_ref
    fallback_meta["provider_fallback_trace"] = trace
    return fallback_meta


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
    input_attachments: list[dict[str, Any]] | None = None,
    structured_output_schema: dict[str, Any] | None = None,
    structured_output_mode: str | None = None,
    model_runtime_fixture: dict[str, Any] | None = None,
    prompt_cache_policy: dict[str, Any] | None = None,
    provider_cost_budget: dict[str, Any] | None = None,
    provider_cost_budget_approval: dict[str, Any] | None = None,
    provider_rate_profile: dict[str, Any] | None = None,
    request_timeout_seconds: float | None = None,
    tools: list[dict[str, Any]] | None = None,
) -> tuple[str, dict[str, Any]]:
    fixture = model_runtime_fixture if isinstance(model_runtime_fixture, dict) else {}
    fixture_providers = fixture.get("model_providers")
    if isinstance(fixture_providers, dict):
        saved_providers = fixture_providers
        persist_credential_state = False
    else:
        saved_settings = load_app_settings()
        saved_providers = saved_settings.get("model_providers")
        saved_providers = saved_providers if isinstance(saved_providers, dict) else {}
        persist_credential_state = True
    provider_id, model_name = _split_model_ref(model_ref)
    requested_model_ref = f"{provider_id}/{model_name}".strip("/")
    _LAST_MODEL_REQUEST_LOG.set({})

    try:
        return _chat_with_model_ref_once(
            model_ref=requested_model_ref,
            saved_providers=saved_providers,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_enabled=thinking_enabled,
            thinking_level=thinking_level,
            on_delta=on_delta,
            input_attachments=input_attachments,
            structured_output_schema=structured_output_schema,
            structured_output_mode=structured_output_mode,
            model_runtime_fixture=fixture,
            prompt_cache_policy=prompt_cache_policy,
            provider_cost_budget=provider_cost_budget,
            provider_cost_budget_approval=provider_cost_budget_approval,
            provider_rate_profile=provider_rate_profile,
            request_timeout_seconds=request_timeout_seconds,
            tools=tools,
            persist_credential_state=persist_credential_state,
        )
    except ProviderCostBudgetExceeded as budget_exc:
        if not _provider_cost_budget_degradation_enabled(provider_cost_budget):
            raise
        return _chat_with_model_ref_cost_budget_degradation(
            requested_model_ref=requested_model_ref,
            saved_providers=saved_providers,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            thinking_enabled=thinking_enabled,
            thinking_level=thinking_level,
            on_delta=on_delta,
            input_attachments=input_attachments,
            structured_output_schema=structured_output_schema,
            structured_output_mode=structured_output_mode,
            model_runtime_fixture=fixture,
            prompt_cache_policy=prompt_cache_policy,
            provider_cost_budget=provider_cost_budget,
            provider_cost_budget_approval=provider_cost_budget_approval,
            provider_rate_profile=provider_rate_profile,
            request_timeout_seconds=request_timeout_seconds,
            tools=tools,
            persist_credential_state=persist_credential_state,
            primary_exc=budget_exc,
        )


def _chat_with_model_ref_cost_budget_degradation(
    *,
    requested_model_ref: str,
    saved_providers: dict[str, Any],
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    max_tokens: int | None,
    thinking_enabled: bool,
    thinking_level: str | None,
    on_delta: Callable[[str], None] | None,
    input_attachments: list[dict[str, Any]] | None,
    structured_output_schema: dict[str, Any] | None,
    structured_output_mode: str | None = None,
    model_runtime_fixture: dict[str, Any],
    prompt_cache_policy: dict[str, Any] | None,
    provider_cost_budget: dict[str, Any] | None,
    provider_cost_budget_approval: dict[str, Any] | None,
    provider_rate_profile: dict[str, Any] | None,
    request_timeout_seconds: float | None,
    tools: list[dict[str, Any]] | None,
    persist_credential_state: bool,
    primary_exc: ProviderCostBudgetExceeded,
) -> tuple[str, dict[str, Any]]:
    provider_id, model_name = _split_model_ref(requested_model_ref)
    fallback_result = resolve_provider_fallback(
        {
            "requested_model_ref": requested_model_ref,
            "required_capabilities": _required_chat_capabilities(
                input_attachments=input_attachments,
                structured_output_schema=structured_output_schema,
            ),
            "required_permissions": ["text_generation"],
            "failure_event": _provider_failure_event(
                model_ref=requested_model_ref,
                provider_id=provider_id,
                model_name=model_name,
                exc=primary_exc,
            ),
            "provider_candidates": _provider_fallback_candidates(
                requested_provider_id=provider_id,
                requested_model_name=model_name,
                saved_providers=saved_providers,
            ),
        }
    )
    selected_model_ref = str(fallback_result.get("selected_model_ref") or "").strip()
    if not selected_model_ref or selected_model_ref == requested_model_ref:
        raise primary_exc

    fallback_trace = _runtime_fallback_trace(fallback_result)
    fallback_trace["trigger"] = "provider_cost_budget_degradation"
    fallback_trace["provider_cost_budget_preflight"] = dict(primary_exc.decision)
    fallback_errors: list[str] = []
    for candidate_model_ref in _fallback_candidate_model_refs(fallback_result, fallback_trace, requested_model_ref):
        degradation = _provider_cost_budget_degradation_record(
            preflight_decision=primary_exc.decision,
            requested_model_ref=requested_model_ref,
            selected_model_ref=candidate_model_ref,
        )
        try:
            content, meta = _chat_with_model_ref_once(
                model_ref=candidate_model_ref,
                saved_providers=saved_providers,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                thinking_enabled=thinking_enabled,
                thinking_level=thinking_level,
                on_delta=on_delta,
                input_attachments=input_attachments,
                structured_output_schema=structured_output_schema,
                structured_output_mode=structured_output_mode,
                model_runtime_fixture=model_runtime_fixture,
                prompt_cache_policy=prompt_cache_policy,
                provider_cost_budget=provider_cost_budget,
                provider_cost_budget_approval=provider_cost_budget_approval,
                provider_cost_budget_degradation=degradation,
                provider_rate_profile=provider_rate_profile,
                request_timeout_seconds=request_timeout_seconds,
                tools=tools,
                persist_credential_state=persist_credential_state,
            )
        except ProviderCostBudgetExceeded:
            raise
        except ProviderRateProfileExceeded:
            raise
        except Exception as fallback_exc:
            fallback_errors.append(f"{candidate_model_ref}: {fallback_exc}")
            _append_failed_fallback_attempt(fallback_trace, candidate_model_ref, fallback_exc)
            continue

        _append_selected_fallback_attempt(fallback_trace, candidate_model_ref)
        fallback_trace["trigger"] = "provider_cost_budget_degradation"
        fallback_trace["provider_cost_budget_preflight"] = dict(primary_exc.decision)
        _annotate_last_model_request_log_with_provider_fallback(fallback_trace, candidate_model_ref)
        meta = {**meta, "provider_cost_budget_degradation": degradation}
        return content, _with_provider_fallback_meta(
            meta,
            trace=fallback_trace,
            requested_model_ref=requested_model_ref,
            selected_model_ref=candidate_model_ref,
            primary_error=primary_exc,
        )

    raise RuntimeError(
        "Primary provider cost budget was exhausted and all compatible degradation fallback providers failed: "
        f"{'; '.join(fallback_errors)}"
    ) from primary_exc

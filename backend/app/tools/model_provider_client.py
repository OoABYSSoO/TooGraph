from __future__ import annotations

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
    THINKING_LEVEL_HIGH,
    THINKING_LEVEL_OFF,
    normalize_thinking_level,
)
from app.tools.openai_codex_client import (
    refresh_codex_access_token,
    resolve_codex_access_token,
)
from app.tools import model_provider_anthropic, model_provider_codex, model_provider_discovery, model_provider_gemini, model_provider_openai
from app.tools.video_frame_fallback import (
    build_video_frame_fallback_attachments,
    should_fallback_video_to_frames,
)
from app.tools.model_provider_http import (
    append_model_request_log_safely,
    build_auth_headers as _build_auth_headers,
    normalize_base_url as _normalize_base_url,
    post_streaming_json_with_fallback,
)


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
    input_attachments: list[dict[str, Any]] | None = None,
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
        input_attachments=input_attachments,
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
) -> tuple[str, dict[str, Any]]:
    normalized_transport = normalize_transport(transport)
    normalized_base_url = _normalize_base_url(base_url)
    warnings: list[str] = []
    resolved_thinking_level = normalize_thinking_level(
        thinking_level if thinking_level is not None else (THINKING_LEVEL_HIGH if thinking_enabled else THINKING_LEVEL_OFF),
        fallback=THINKING_LEVEL_OFF,
    )

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE:
        def invoke(attachments: list[dict[str, Any]] | None) -> tuple[str, dict[str, Any]]:
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
            )
    elif normalized_transport == TRANSPORT_ANTHROPIC_MESSAGES:
        def invoke(attachments: list[dict[str, Any]] | None) -> tuple[str, dict[str, Any]]:
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
            )
    elif normalized_transport == TRANSPORT_GEMINI_GENERATE_CONTENT:
        def invoke(attachments: list[dict[str, Any]] | None) -> tuple[str, dict[str, Any]]:
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
            )
    elif normalized_transport == TRANSPORT_CODEX_RESPONSES:
        def invoke(attachments: list[dict[str, Any]] | None) -> tuple[str, dict[str, Any]]:
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
            )
    else:  # pragma: no cover - guarded by normalize_transport
        raise RuntimeError(f"Unsupported provider transport: {normalized_transport}")

    content, meta = _invoke_with_video_auto_fallback(invoke, input_attachments=input_attachments)
    stream_fallback_error = str(meta.get("stream_fallback_error") or "").strip()
    if stream_fallback_error:
        warnings.append(f"Streaming request failed; retried once without streaming. {stream_fallback_error}")
    video_fallback_warning = str(meta.pop("_video_fallback_warning", "") or "").strip()
    if video_fallback_warning:
        warnings.append(video_fallback_warning)
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


def _invoke_with_video_auto_fallback(
    invoke: Callable[[list[dict[str, Any]] | None], tuple[str, dict[str, Any]]],
    *,
    input_attachments: list[dict[str, Any]] | None,
) -> tuple[str, dict[str, Any]]:
    try:
        return invoke(input_attachments)
    except Exception as exc:
        if not should_fallback_video_to_frames(exc, input_attachments):
            raise
        fallback_attachments, fallback_meta = build_video_frame_fallback_attachments(input_attachments)
        try:
            content, meta = invoke(fallback_attachments)
        except Exception as fallback_exc:
            raise RuntimeError(
                f"Native video request failed, and frame fallback also failed: {fallback_exc}"
            ) from fallback_exc
        meta["video_fallback"] = fallback_meta
        meta["_video_fallback_warning"] = f"Native video request failed; analyzed extracted frames instead. {exc}"
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
    input_attachments: list[dict[str, Any]] | None = None,
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
            input_attachments=input_attachments,
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
        input_attachments=input_attachments,
    )

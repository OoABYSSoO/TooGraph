from __future__ import annotations

import tempfile
from typing import Any, Callable

import httpx

from app.core.provider_fallback import resolve_provider_fallback
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
    structured_output_schema: dict[str, Any] | None = None,
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
    structured_output_schema: dict[str, Any] | None = None,
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
    structured_output_schema: dict[str, Any] | None = None,
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

    try:
        return _rerank_documents_with_model_ref_once(
            model_ref=requested_model_ref,
            saved_providers=saved_providers,
            query=query,
            documents=documents,
            top_n=top_n,
        )
    except Exception as primary_exc:
        fallback_result = resolve_provider_fallback(
            {
                "requested_model_ref": requested_model_ref,
                "required_capabilities": ["rerank"],
                "required_permissions": ["rerank"],
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
                    default_permissions=["rerank"],
                ),
            }
        )
        selected_model_ref = str(fallback_result.get("selected_model_ref") or "").strip()
        if not selected_model_ref or selected_model_ref == requested_model_ref:
            raise

        fallback_trace = _runtime_fallback_trace(fallback_result)
        fallback_errors: list[str] = []
        for candidate_model_ref in _fallback_candidate_model_refs(fallback_result, fallback_trace, requested_model_ref):
            try:
                results, meta = _rerank_documents_with_model_ref_once(
                    model_ref=candidate_model_ref,
                    saved_providers=saved_providers,
                    query=query,
                    documents=documents,
                    top_n=top_n,
                )
            except Exception as fallback_exc:
                fallback_errors.append(f"{candidate_model_ref}: {fallback_exc}")
                _append_failed_fallback_attempt(fallback_trace, candidate_model_ref, fallback_exc)
                continue

            _append_selected_fallback_attempt(fallback_trace, candidate_model_ref)
            return results, _with_provider_fallback_meta(
                meta,
                trace=fallback_trace,
                requested_model_ref=requested_model_ref,
                selected_model_ref=candidate_model_ref,
                primary_error=primary_exc,
            )

        raise RuntimeError(
            f"Primary rerank provider '{requested_model_ref}' failed and all compatible fallback providers failed: {'; '.join(fallback_errors)}"
        ) from primary_exc


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

    try:
        return _embed_text_with_model_ref_once(
            model_ref=requested_model_ref,
            saved_providers=saved_providers,
            text=text,
            dimensions=dimensions,
        )
    except Exception as primary_exc:
        fallback_result = resolve_provider_fallback(
            {
                "requested_model_ref": requested_model_ref,
                "required_capabilities": ["embedding"],
                "required_permissions": ["embedding"],
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
                    default_permissions=["embedding"],
                ),
            }
        )
        selected_model_ref = str(fallback_result.get("selected_model_ref") or "").strip()
        if not selected_model_ref or selected_model_ref == requested_model_ref:
            raise

        fallback_trace = _runtime_fallback_trace(fallback_result)
        fallback_errors: list[str] = []
        for candidate_model_ref in _fallback_candidate_model_refs(fallback_result, fallback_trace, requested_model_ref):
            try:
                vector, meta = _embed_text_with_model_ref_once(
                    model_ref=candidate_model_ref,
                    saved_providers=saved_providers,
                    text=text,
                    dimensions=dimensions,
                )
            except Exception as fallback_exc:
                fallback_errors.append(f"{candidate_model_ref}: {fallback_exc}")
                _append_failed_fallback_attempt(fallback_trace, candidate_model_ref, fallback_exc)
                continue

            _append_selected_fallback_attempt(fallback_trace, candidate_model_ref)
            return vector, _with_provider_fallback_meta(
                meta,
                trace=fallback_trace,
                requested_model_ref=requested_model_ref,
                selected_model_ref=candidate_model_ref,
                primary_error=primary_exc,
            )

        raise RuntimeError(
            f"Primary embedding provider '{requested_model_ref}' failed and all compatible fallback providers failed: {'; '.join(fallback_errors)}"
        ) from primary_exc


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
                structured_output_schema=structured_output_schema,
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
                structured_output_schema=structured_output_schema,
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
                structured_output_schema=structured_output_schema,
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
                structured_output_schema=structured_output_schema,
            )
    else:  # pragma: no cover - guarded by normalize_transport
        raise RuntimeError(f"Unsupported provider transport: {normalized_transport}")

    request_attachments = _prepare_request_attachments_for_transport(normalized_transport, input_attachments)
    content, meta = _invoke_with_video_auto_fallback(
        invoke,
        input_attachments=request_attachments,
        transport=normalized_transport,
    )
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
        raise RuntimeError(f"{provider_id} returned an empty response.")
    if resolved_thinking_level != THINKING_LEVEL_OFF and not bool(meta.get("thinking_enabled")):
        warnings.append(
            f"Thinking level '{resolved_thinking_level}' was requested for provider '{provider_id}', but TooGraph did not find a native thinking field for this provider/model."
        )
    if structured_output_schema and not meta.get("structured_output_strategy"):
        meta["structured_output_strategy"] = "prompt_validation"
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
    transport: str,
) -> tuple[str, dict[str, Any]]:
    try:
        return invoke(input_attachments)
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
                content, meta = invoke(fallback_attachments)
            except Exception as fallback_exc:
                raise RuntimeError(
                    f"Native video request failed, and frame fallback also failed: {fallback_exc}"
                ) from fallback_exc
        meta["video_fallback"] = fallback_meta
        meta["_video_fallback_warning"] = f"Native video request failed; analyzed extracted frames instead. {exc}"
        return content, meta


def _prepare_request_attachments_for_transport(
    transport: str,
    input_attachments: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    if transport in {TRANSPORT_OPENAI_COMPATIBLE, TRANSPORT_CODEX_RESPONSES}:
        return inline_provider_image_attachments(input_attachments)
    return input_attachments


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
) -> tuple[str, dict[str, Any]]:
    provider_id, model_name = _split_model_ref(model_ref)
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
        )

    template, provider_config = _provider_config_from_saved(provider_id, saved_providers)
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
        auth_scheme=_provider_auth_scheme(provider_config, template),
        on_delta=on_delta,
        input_attachments=input_attachments,
        structured_output_schema=structured_output_schema,
    )


def _provider_requires_api_key(provider_id: str, provider_config: dict[str, Any]) -> bool:
    if provider_id == "local":
        return False
    if provider_config.get("auth_mode") == "chatgpt":
        return False
    base_url = str(provider_config.get("base_url") or "").lower()
    if "localhost" in base_url or "127.0.0.1" in base_url or base_url.startswith("http://0.0.0.0"):
        return False
    return True


def _provider_configured(provider_id: str, provider_config: dict[str, Any]) -> bool:
    if not str(provider_config.get("base_url") or "").strip():
        return False
    if _provider_requires_api_key(provider_id, provider_config) and not str(provider_config.get("api_key") or "").strip():
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
    if isinstance(exc, httpx.TimeoutException) or "timeout" in lowered_message or "timed out" in lowered_message:
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
) -> tuple[str, dict[str, Any]]:
    saved_settings = load_app_settings()
    saved_providers = saved_settings.get("model_providers")
    saved_providers = saved_providers if isinstance(saved_providers, dict) else {}
    provider_id, model_name = _split_model_ref(model_ref)
    requested_model_ref = f"{provider_id}/{model_name}".strip("/")

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
        )
    except Exception as primary_exc:
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
            raise

        fallback_trace = _runtime_fallback_trace(fallback_result)
        fallback_errors: list[str] = []
        for candidate_model_ref in _fallback_candidate_model_refs(fallback_result, fallback_trace, requested_model_ref):
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
                )
            except Exception as fallback_exc:
                fallback_errors.append(f"{candidate_model_ref}: {fallback_exc}")
                _append_failed_fallback_attempt(fallback_trace, candidate_model_ref, fallback_exc)
                continue

            _append_selected_fallback_attempt(fallback_trace, candidate_model_ref)
            return content, _with_provider_fallback_meta(
                meta,
                trace=fallback_trace,
                requested_model_ref=requested_model_ref,
                selected_model_ref=candidate_model_ref,
                primary_error=primary_exc,
            )

        raise RuntimeError(
            f"Primary provider '{requested_model_ref}' failed and all compatible fallback providers failed: {'; '.join(fallback_errors)}"
        ) from primary_exc

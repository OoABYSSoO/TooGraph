from __future__ import annotations

import os
from typing import Any

from app.core.storage.settings_store import load_app_settings
from app.tools.local_llm import (
    get_default_text_model,
    get_local_llm_base_url,
    get_local_gateway_runtime_config,
    get_local_route_model_names,
    has_local_llm_api_key_configured,
)


def build_model_ref(provider_id: str, model_id: str) -> str:
    return f"{provider_id.strip()}/{model_id.strip()}".strip("/")


def split_model_ref(model_ref: str | None, *, default_provider: str = "local") -> tuple[str, str]:
    trimmed = (model_ref or "").strip()
    if not trimmed:
        return default_provider, get_default_text_model()
    if "/" not in trimmed:
        return default_provider, trimmed
    provider_id, model_id = trimmed.split("/", 1)
    provider_id = provider_id.strip() or default_provider
    model_id = model_id.strip() or get_default_text_model()
    return provider_id, model_id


def normalize_model_ref(model_ref: str | None, *, default_provider: str = "local") -> str:
    provider_id, model_id = split_model_ref(model_ref, default_provider=default_provider)
    return build_model_ref(provider_id, model_id)


def resolve_runtime_model_name(model_ref: str | None, *, default_provider: str = "local") -> str:
    _provider_id, model_id = split_model_ref(model_ref, default_provider=default_provider)
    return model_id


def get_default_text_model_ref(*, force_refresh: bool = False) -> str:
    saved_settings = load_app_settings()
    saved_text_model_ref = str(saved_settings.get("text_model_ref") or "").strip()
    if saved_text_model_ref:
        saved_provider, saved_model = split_model_ref(saved_text_model_ref, default_provider="local")
        local_route_models = get_local_route_model_names(force_refresh=force_refresh)
        if saved_provider != "local" or not local_route_models or saved_model in local_route_models:
            return normalize_model_ref(saved_text_model_ref, default_provider="local")
        return build_model_ref("local", local_route_models[0])
    return normalize_model_ref(get_default_text_model(force_refresh=force_refresh), default_provider="local")


def get_default_video_model_name(*, force_refresh: bool = False) -> str:
    saved_settings = load_app_settings()
    saved_video_model_ref = str(saved_settings.get("video_model_ref") or "").strip()
    if saved_video_model_ref:
        saved_provider, saved_model = split_model_ref(saved_video_model_ref, default_provider="local")
        local_route_models = get_local_route_model_names(force_refresh=force_refresh)
        if saved_provider != "local" or not local_route_models or saved_model in local_route_models:
            return saved_model
        return local_route_models[0]
    return (
        os.environ.get("LOCAL_VIDEO_MODEL")
        or os.environ.get("VIDEO_MODEL")
        or os.environ.get("LOCAL_MODEL_NAME")
        or os.environ.get("UPSTREAM_MODEL_NAME")
        or get_default_text_model(force_refresh=force_refresh)
    )


def get_default_video_model_ref(*, force_refresh: bool = False) -> str:
    saved_settings = load_app_settings()
    saved_video_model_ref = str(saved_settings.get("video_model_ref") or "").strip()
    if saved_video_model_ref:
        saved_provider, saved_model = split_model_ref(saved_video_model_ref, default_provider="local")
        local_route_models = get_local_route_model_names(force_refresh=force_refresh)
        if saved_provider != "local" or not local_route_models or saved_model in local_route_models:
            return normalize_model_ref(saved_video_model_ref, default_provider="local")
        return build_model_ref("local", local_route_models[0])
    return normalize_model_ref(get_default_video_model_name(force_refresh=force_refresh), default_provider="local")


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _get_saved_local_provider_config(saved_settings: dict[str, Any]) -> dict[str, Any]:
    model_providers = saved_settings.get("model_providers")
    if not isinstance(model_providers, dict):
        return {}
    local_provider = model_providers.get("local")
    return local_provider if isinstance(local_provider, dict) else {}


def _get_saved_local_provider_models(local_provider: dict[str, Any]) -> list[dict[str, str]]:
    raw_models = local_provider.get("models")
    if not isinstance(raw_models, list):
        return []

    models: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in raw_models:
        if not isinstance(item, dict):
            continue
        model_name = str(item.get("model") or item.get("id") or "").strip()
        if not model_name:
            continue
        identity = model_name.lower()
        if identity in seen:
            continue
        seen.add(identity)
        label = str(item.get("label") or model_name).strip() or model_name
        route_target = str(item.get("route_target") or "").strip()
        models.append({"model": model_name, "label": label, "route_target": route_target})
    return models


def _dedupe_local_provider_models(
    models: list[dict[str, Any]],
    *,
    preferred_model_ref: str | None = None,
) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    index_by_identity: dict[str, int] = {}
    normalized_preferred = normalize_model_ref(preferred_model_ref, default_provider="local") if preferred_model_ref else ""

    for model in models:
        route_target = str(model.get("route_target") or "").strip().lower()
        label = str(model.get("label") or "").strip().lower()
        runtime_model = str(model.get("model") or "").strip().lower()
        model_ref = normalize_model_ref(str(model.get("model_ref") or ""), default_provider="local")
        identity = route_target or label or runtime_model or model_ref.lower()
        existing_index = index_by_identity.get(identity)

        if existing_index is None:
            index_by_identity[identity] = len(deduped)
            deduped.append(model)
            continue

        if normalized_preferred and model_ref == normalized_preferred:
            current_ref = normalize_model_ref(str(deduped[existing_index].get("model_ref") or ""), default_provider="local")
            if current_ref != normalized_preferred:
                deduped[existing_index] = model

    return deduped


def build_model_catalog(*, force_refresh: bool = False) -> dict[str, Any]:
    saved_settings = load_app_settings()
    saved_local_provider = _get_saved_local_provider_config(saved_settings)
    saved_local_models = _get_saved_local_provider_models(saved_local_provider)
    runtime_config = get_local_gateway_runtime_config(force_refresh=force_refresh)
    llama_config = _dict_or_empty(runtime_config.get("llama")) if isinstance(runtime_config, dict) else {}
    cloud_config = _dict_or_empty(runtime_config.get("cloud")) if isinstance(runtime_config, dict) else {}

    local_route_models = get_local_route_model_names(force_refresh=force_refresh)
    saved_text_model_ref = str(saved_settings.get("text_model_ref") or "").strip()
    _saved_text_provider, saved_text_model = split_model_ref(saved_text_model_ref, default_provider="local")
    preferred_local_text_model = saved_text_model if saved_text_model_ref else get_default_text_model(force_refresh=force_refresh)
    if local_route_models:
        local_text_model = preferred_local_text_model if preferred_local_text_model in local_route_models else local_route_models[0]
    elif saved_local_models and preferred_local_text_model in {model["model"] for model in saved_local_models}:
        local_text_model = preferred_local_text_model
    elif saved_local_models:
        local_text_model = saved_local_models[0]["model"]
    else:
        local_text_model = local_route_models[0] if local_route_models else preferred_local_text_model
    local_video_model = get_default_video_model_name(force_refresh=force_refresh)
    local_context_window = llama_config.get("ctx_size") if isinstance(llama_config, dict) else None
    local_max_tokens = llama_config.get("n_predict") if isinstance(llama_config, dict) else None
    local_display_model_name = (
        str(runtime_config.get("display_model_name")).strip()
        if isinstance(runtime_config, dict) and runtime_config.get("display_model_name")
        else None
    )
    saved_model_by_name = {model["model"]: model for model in saved_local_models}
    local_provider_models = [
        {
            "model_ref": build_model_ref("local", model_name),
            "model": model_name,
            "label": saved_model_by_name.get(model_name, {}).get("label") or model_name,
            "reasoning": True,
            "modalities": ["text"],
            "context_window": local_context_window if isinstance(local_context_window, int) else None,
            "max_tokens": local_max_tokens if isinstance(local_max_tokens, int) else None,
            "route_target": saved_model_by_name.get(model_name, {}).get("route_target") or local_display_model_name,
        }
        for model_name in local_route_models
    ]
    if not local_provider_models:
        local_provider_models = [
            {
                "model_ref": build_model_ref("local", model["model"]),
                "model": model["model"],
                "label": model["label"],
                "reasoning": True,
                "modalities": ["text"],
                "context_window": local_context_window if isinstance(local_context_window, int) else None,
                "max_tokens": local_max_tokens if isinstance(local_max_tokens, int) else None,
                "route_target": model["route_target"] or local_display_model_name,
            }
            for model in saved_local_models
        ]
    local_provider_models = _dedupe_local_provider_models(
        local_provider_models,
        preferred_model_ref=build_model_ref("local", local_text_model),
    )
    if not local_provider_models:
        local_provider_models = [
            {
                "model_ref": build_model_ref("local", local_text_model),
                "model": local_text_model,
                "label": local_text_model,
                "reasoning": True,
                "modalities": ["text"],
                "context_window": local_context_window if isinstance(local_context_window, int) else None,
                "max_tokens": local_max_tokens if isinstance(local_max_tokens, int) else None,
                "route_target": local_display_model_name,
            }
        ]

    openrouter_aliases = cloud_config.get("aliases") if isinstance(cloud_config, dict) else {}
    openrouter_models = cloud_config.get("models") if isinstance(cloud_config, dict) else {}
    openrouter_example_refs: list[str] = []
    if isinstance(openrouter_aliases, dict):
        openrouter_example_refs.extend(
            build_model_ref("openrouter", str(alias).strip())
            for alias in openrouter_aliases.values()
            if str(alias).strip()
        )
    if isinstance(openrouter_models, dict):
        openrouter_example_refs.extend(
            build_model_ref("openrouter", str(model_name).strip())
            for model_name in openrouter_models.values()
            if str(model_name).strip()
        )
    deduped_openrouter_example_refs: list[str] = []
    seen_openrouter_refs: set[str] = set()
    for model_ref in openrouter_example_refs:
        lowered = model_ref.lower()
        if lowered in seen_openrouter_refs:
            continue
        seen_openrouter_refs.add(lowered)
        deduped_openrouter_example_refs.append(model_ref)

    return {
        "default_text_model_ref": build_model_ref("local", local_text_model),
        "default_video_model_ref": build_model_ref("local", local_video_model),
        "providers": [
            {
                "provider_id": "local",
                "label": str(saved_local_provider.get("label") or "OpenAI-compatible Custom Provider"),
                "description": "Custom OpenAI-compatible endpoint used by GraphiteUI for local or private model routing.",
                "transport": "openai-compatible",
                "configured": True,
                "base_url": str(saved_local_provider.get("base_url") or get_local_llm_base_url()).rstrip("/"),
                "api_key_configured": bool(str(saved_local_provider.get("api_key") or "").strip())
                or has_local_llm_api_key_configured(),
                "models": local_provider_models,
                "example_model_refs": [],
                "gateway": runtime_config or {},
            },
            {
                "provider_id": "openai",
                "label": "OpenAI",
                "description": "Planned cloud provider entry for direct OpenAI models.",
                "transport": "openai-responses",
                "configured": False,
                "base_url": "https://api.openai.com/v1",
                "models": [],
                "example_model_refs": ["openai/gpt-5.4", "openai/gpt-5.4-mini"],
            },
            {
                "provider_id": "anthropic",
                "label": "Anthropic",
                "description": "Planned cloud provider entry for Claude models.",
                "transport": "anthropic-messages",
                "configured": False,
                "base_url": "https://api.anthropic.com/v1",
                "models": [],
                "example_model_refs": ["anthropic/claude-opus-4-6", "anthropic/claude-sonnet-4-6"],
            },
            {
                "provider_id": "google",
                "label": "Google Gemini",
                "description": "Planned provider entry for Gemini text and multimodal models.",
                "transport": "google-gemini",
                "configured": False,
                "base_url": "https://generativelanguage.googleapis.com",
                "models": [],
                "example_model_refs": ["google/gemini-3.1-pro-preview", "google/gemini-3-flash-preview"],
            },
            {
                "provider_id": "openrouter",
                "label": "OpenRouter",
                "description": "Planned proxy provider entry for multi-vendor routing through one gateway.",
                "transport": "openai-compatible",
                "configured": False,
                "base_url": str(cloud_config.get("api_base") or "https://openrouter.ai/api/v1"),
                "models": [],
                "example_model_refs": deduped_openrouter_example_refs or ["openrouter/anthropic/claude-sonnet-4.6", "openrouter/auto"],
            },
        ],
    }

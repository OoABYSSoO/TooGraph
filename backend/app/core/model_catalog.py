from __future__ import annotations

import os
from typing import Any

from app.core.storage.settings_store import load_app_settings
from app.tools.local_llm import (
    LOCAL_LLM_BASE_URL,
    get_default_text_model,
    get_local_gateway_runtime_config,
    get_local_route_model_names,
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


def get_default_text_model_ref() -> str:
    return normalize_model_ref(get_default_text_model(), default_provider="local")


def get_default_video_model_name() -> str:
    saved_settings = load_app_settings()
    saved_video_model_ref = str(saved_settings.get("video_model_ref") or "").strip()
    if saved_video_model_ref:
        return split_model_ref(saved_video_model_ref, default_provider="local")[1]
    return (
        os.environ.get("LOCAL_VIDEO_MODEL")
        or os.environ.get("VIDEO_MODEL")
        or os.environ.get("LOCAL_MODEL_NAME")
        or os.environ.get("UPSTREAM_MODEL_NAME")
        or get_default_text_model()
    )


def get_default_video_model_ref() -> str:
    return normalize_model_ref(get_default_video_model_name(), default_provider="local")


def build_model_catalog() -> dict[str, Any]:
    runtime_config = get_local_gateway_runtime_config()
    llama_config = runtime_config.get("llama") if isinstance(runtime_config, dict) else {}
    cloud_config = runtime_config.get("cloud") if isinstance(runtime_config, dict) else {}

    local_route_models = get_local_route_model_names()
    local_text_model = local_route_models[0] if local_route_models else get_default_text_model()
    local_video_model = get_default_video_model_name()
    local_context_window = llama_config.get("ctx_size") if isinstance(llama_config, dict) else None
    local_max_tokens = llama_config.get("n_predict") if isinstance(llama_config, dict) else None
    local_display_model_name = (
        str(runtime_config.get("display_model_name")).strip()
        if isinstance(runtime_config, dict) and runtime_config.get("display_model_name")
        else None
    )
    local_provider_models = [
        {
            "model_ref": build_model_ref("local", model_name),
            "model": model_name,
            "label": model_name,
            "reasoning": True,
            "modalities": ["text"],
            "context_window": local_context_window if isinstance(local_context_window, int) else None,
            "max_tokens": local_max_tokens if isinstance(local_max_tokens, int) else None,
            "route_target": local_display_model_name,
        }
        for model_name in local_route_models
    ]
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
                "label": "Local Gateway",
                "description": "Current GraphiteUI local model gateway. GraphiteUI sends provider/model refs here first, then the gateway routes to llama.cpp or future upstream vendors.",
                "transport": "openai-compatible",
                "configured": True,
                "base_url": LOCAL_LLM_BASE_URL,
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

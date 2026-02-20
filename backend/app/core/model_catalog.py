from __future__ import annotations

import os
from typing import Any

from app.core.model_provider_templates import get_provider_template, list_provider_templates, normalize_transport
from app.core.storage.settings_store import load_app_settings
from app.tools.local_llm import (
    get_default_text_model,
    get_local_llm_base_url,
    get_local_gateway_runtime_config,
    get_local_route_model_names,
    has_local_llm_api_key_configured,
)
from app.tools.model_provider_client import discover_provider_models
from app.tools.openai_codex_client import get_codex_auth_status


LOCAL_PROVIDER_LABEL = "OpenAI-compatible Custom Provider"
LOCAL_PROVIDER_DESCRIPTION = "Custom OpenAI-compatible endpoint used by GraphiteUI for local or private model routing."


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


def _dict_or_empty(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _dedupe_strings(values: list[str]) -> list[str]:
    items: list[str] = []
    seen: set[str] = set()
    for raw_value in values:
        value = str(raw_value or "").strip()
        if not value:
            continue
        identity = value.lower()
        if identity in seen:
            continue
        seen.add(identity)
        items.append(value)
    return items


def _get_saved_provider_configs(saved_settings: dict[str, Any]) -> dict[str, dict[str, Any]]:
    model_providers = saved_settings.get("model_providers")
    if not isinstance(model_providers, dict):
        return {}
    return {
        str(provider_id).strip(): provider
        for provider_id, provider in model_providers.items()
        if str(provider_id).strip() and isinstance(provider, dict)
    }


def _normalize_model_item(item: Any) -> dict[str, Any] | None:
    if not isinstance(item, dict):
        return None
    model_name = str(item.get("model") or item.get("id") or "").strip()
    if not model_name:
        return None
    label = str(item.get("label") or item.get("name") or model_name).strip() or model_name
    modalities = item.get("modalities") or item.get("input") or ["text"]
    if not isinstance(modalities, list):
        modalities = ["text"]
    return {
        "model": model_name,
        "label": label,
        "route_target": str(item.get("route_target") or "").strip(),
        "reasoning": item.get("reasoning") if isinstance(item.get("reasoning"), bool) else None,
        "modalities": _dedupe_strings([str(modality) for modality in modalities]) or ["text"],
        "context_window": item.get("context_window") if isinstance(item.get("context_window"), int) else None,
        "max_tokens": item.get("max_tokens") if isinstance(item.get("max_tokens"), int) else None,
    }


def _normalize_provider_models(raw_models: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_models, list):
        return []

    models: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw_models:
        normalized = _normalize_model_item(item)
        if normalized is None:
            continue
        identity = normalized["model"].lower()
        if identity in seen:
            continue
        seen.add(identity)
        models.append(normalized)
    return models


def _safe_transport(value: Any, fallback: str) -> str:
    try:
        return normalize_transport(str(value or fallback))
    except ValueError:
        return fallback


def _is_local_base_url(base_url: str) -> bool:
    normalized = str(base_url or "").lower()
    return "localhost" in normalized or "127.0.0.1" in normalized or normalized.startswith("http://0.0.0.0")


def _normalize_provider_config(
    provider_id: str,
    saved_provider: dict[str, Any] | None,
    *,
    runtime_config: dict[str, Any] | None,
) -> dict[str, Any]:
    template = get_provider_template(provider_id)
    saved_provider = saved_provider if isinstance(saved_provider, dict) else {}
    template_transport = str(template.get("transport") or "openai-compatible")
    transport = _safe_transport(saved_provider.get("transport"), template_transport)
    default_base_url = str(template.get("base_url") or "")
    if provider_id == "local":
        default_base_url = get_local_llm_base_url()
    if provider_id == "openrouter" and isinstance(runtime_config, dict):
        cloud_config = _dict_or_empty(runtime_config.get("cloud"))
        default_base_url = str(cloud_config.get("api_base") or default_base_url)

    base_url = str(saved_provider.get("base_url") or default_base_url).strip().rstrip("/")
    existing_saved_provider = bool(saved_provider)
    enabled = saved_provider.get("enabled")
    if not isinstance(enabled, bool):
        enabled = provider_id == "local" or existing_saved_provider and provider_id not in {"bedrock"}

    auth_header = str(saved_provider.get("auth_header") or template.get("auth_header") or "Authorization").strip()
    if "auth_scheme" in saved_provider:
        auth_scheme = str(saved_provider.get("auth_scheme") or "")
    else:
        auth_scheme = str(template.get("auth_scheme") if template.get("auth_scheme") is not None else "Bearer")

    label_default = LOCAL_PROVIDER_LABEL if provider_id == "local" else str(template.get("label") or provider_id)
    description_default = (
        LOCAL_PROVIDER_DESCRIPTION if provider_id == "local" else str(template.get("description") or f"{label_default} provider.")
    )
    return {
        **template,
        **saved_provider,
        "provider_id": provider_id,
        "label": str(saved_provider.get("label") or label_default),
        "description": str(saved_provider.get("description") or description_default),
        "transport": transport,
        "base_url": base_url,
        "enabled": bool(enabled),
        "auth_header": auth_header,
        "auth_scheme": auth_scheme,
        "api_key": str(saved_provider.get("api_key") or "").strip(),
        "auth_mode": str(saved_provider.get("auth_mode") or template.get("auth_mode") or "api_key"),
        "requires_login": bool(template.get("requires_login") or saved_provider.get("requires_login")),
        "saved": existing_saved_provider,
        "models": _normalize_provider_models(saved_provider.get("models") or template.get("models")),
        "example_model_refs": list(template.get("example_model_refs") or []),
        "template_group": str(template.get("template_group") or "custom"),
    }


def _provider_requires_api_key(provider: dict[str, Any]) -> bool:
    if provider["provider_id"] == "local":
        return False
    if provider.get("auth_mode") == "chatgpt":
        return False
    if _is_local_base_url(str(provider.get("base_url") or "")):
        return False
    return True


def _is_provider_configured(provider: dict[str, Any]) -> bool:
    if not provider.get("enabled"):
        return False
    if not str(provider.get("base_url") or "").strip():
        return False
    if provider["provider_id"] == "openai-codex":
        return bool(get_codex_auth_status().get("authenticated"))
    if _provider_requires_api_key(provider) and not str(provider.get("api_key") or "").strip():
        return False
    return True


def _build_catalog_model(
    provider_id: str,
    model: dict[str, Any],
    *,
    local_context_window: int | None = None,
    local_max_tokens: int | None = None,
    local_display_model_name: str | None = None,
) -> dict[str, Any]:
    context_window = model.get("context_window")
    max_tokens = model.get("max_tokens")
    if provider_id == "local":
        context_window = context_window if isinstance(context_window, int) else local_context_window
        max_tokens = max_tokens if isinstance(max_tokens, int) else local_max_tokens

    return {
        "model_ref": build_model_ref(provider_id, model["model"]),
        "model": model["model"],
        "label": model.get("label") or model["model"],
        "reasoning": model.get("reasoning") if isinstance(model.get("reasoning"), bool) else provider_id == "local",
        "modalities": model.get("modalities") or ["text"],
        "context_window": context_window if isinstance(context_window, int) else None,
        "max_tokens": max_tokens if isinstance(max_tokens, int) else None,
        "route_target": model.get("route_target") or (local_display_model_name if provider_id == "local" else None),
    }


def _build_local_provider_models(
    provider: dict[str, Any],
    *,
    saved_settings: dict[str, Any],
    runtime_config: dict[str, Any] | None,
    force_refresh: bool,
) -> tuple[list[dict[str, Any]], str]:
    llama_config = _dict_or_empty(runtime_config.get("llama")) if isinstance(runtime_config, dict) else {}
    local_route_models = get_local_route_model_names(force_refresh=force_refresh, runtime_config=runtime_config)
    saved_local_models = list(provider.get("models") or [])
    saved_text_model_ref = str(saved_settings.get("text_model_ref") or "").strip()
    if saved_text_model_ref:
        saved_text_provider, saved_text_model = split_model_ref(saved_text_model_ref, default_provider="local")
    else:
        saved_text_provider, saved_text_model = "local", ""
    preferred_local_text_model = (
        saved_text_model
        if saved_text_model_ref and saved_text_provider == "local"
        else local_route_models[0]
        if local_route_models
        else get_default_text_model(force_refresh=False)
    )

    if local_route_models:
        local_text_model = preferred_local_text_model if preferred_local_text_model in local_route_models else local_route_models[0]
        source_models = [
            {
                "model": model_name,
                "label": next(
                    (
                        saved_model["label"]
                        for saved_model in saved_local_models
                        if str(saved_model.get("model") or "").lower() == model_name.lower()
                    ),
                    model_name,
                ),
                "modalities": ["text"],
                "reasoning": True,
                "route_target": "",
                "context_window": None,
                "max_tokens": None,
            }
            for model_name in local_route_models
        ]
    elif saved_local_models:
        local_text_model = (
            preferred_local_text_model
            if preferred_local_text_model in {model["model"] for model in saved_local_models}
            else saved_local_models[0]["model"]
        )
        source_models = saved_local_models
    else:
        local_text_model = preferred_local_text_model
        source_models = [
            {
                "model": local_text_model,
                "label": local_text_model,
                "modalities": ["text"],
                "reasoning": True,
                "route_target": "",
                "context_window": None,
                "max_tokens": None,
            }
        ]

    local_context_window = llama_config.get("ctx_size") if isinstance(llama_config.get("ctx_size"), int) else None
    local_max_tokens = llama_config.get("n_predict") if isinstance(llama_config.get("n_predict"), int) else None
    local_display_model_name = (
        str(runtime_config.get("display_model_name")).strip()
        if isinstance(runtime_config, dict) and runtime_config.get("display_model_name")
        else None
    )
    return (
        [
            _build_catalog_model(
                "local",
                model,
                local_context_window=local_context_window,
                local_max_tokens=local_max_tokens,
                local_display_model_name=local_display_model_name,
            )
            for model in source_models
        ],
        local_text_model,
    )


def _discover_provider_model_items(provider: dict[str, Any], *, force_refresh: bool) -> list[dict[str, Any]]:
    saved_models = list(provider.get("models") or [])
    configured = _is_provider_configured(provider)
    if not force_refresh or not configured or provider["provider_id"] == "local":
        return saved_models

    try:
        discovered_models = discover_provider_models(
            provider_id=provider["provider_id"],
            transport=provider["transport"],
            base_url=provider["base_url"],
            api_key=provider.get("api_key") or "",
            auth_header=provider.get("auth_header") or "Authorization",
            auth_scheme=provider.get("auth_scheme") if provider.get("auth_scheme") is not None else "Bearer",
            timeout_sec=2.0,
        )
    except RuntimeError:
        return saved_models

    saved_by_name = {model["model"].lower(): model for model in saved_models}
    return [
        {
            **saved_by_name.get(model_name.lower(), {}),
            "model": model_name,
            "label": saved_by_name.get(model_name.lower(), {}).get("label") or model_name,
            "modalities": saved_by_name.get(model_name.lower(), {}).get("modalities") or ["text"],
        }
        for model_name in discovered_models
    ]


def _build_provider_entry(
    provider: dict[str, Any],
    *,
    models: list[dict[str, Any]],
    runtime_config: dict[str, Any] | None,
) -> dict[str, Any]:
    api_key_configured = bool(str(provider.get("api_key") or "").strip())
    auth_status = None
    if provider["provider_id"] == "local":
        api_key_configured = api_key_configured or has_local_llm_api_key_configured()
    if provider["provider_id"] == "openai-codex":
        auth_status = get_codex_auth_status()
        api_key_configured = bool(auth_status.get("configured"))

    entry = {
        "provider_id": provider["provider_id"],
        "label": provider["label"],
        "description": provider["description"],
        "transport": provider["transport"],
        "configured": _is_provider_configured(provider),
        "enabled": bool(provider.get("enabled")),
        "base_url": provider["base_url"],
        "auth_header": provider.get("auth_header") or "Authorization",
        "auth_scheme": provider.get("auth_scheme") if provider.get("auth_scheme") is not None else "Bearer",
        "auth_mode": provider.get("auth_mode") or "api_key",
        "requires_login": bool(provider.get("requires_login")),
        "saved": bool(provider.get("saved")),
        "api_key_configured": api_key_configured,
        "models": models,
        "example_model_refs": provider.get("example_model_refs") or [],
        "template_group": provider.get("template_group") or "custom",
    }
    if provider["provider_id"] == "local":
        entry["gateway"] = runtime_config or {}
    if auth_status is not None:
        entry["auth_status"] = auth_status
    return entry


def _resolve_default_model_ref(
    saved_ref: str,
    provider_entries: list[dict[str, Any]],
    *,
    fallback_ref: str,
) -> str:
    provider_by_id = {provider["provider_id"]: provider for provider in provider_entries}
    if saved_ref:
        provider_id, model_id = split_model_ref(saved_ref, default_provider="local")
        provider = provider_by_id.get(provider_id)
        if provider and provider.get("configured"):
            provider_models = [model["model"] for model in provider.get("models", [])]
            if not provider_models or model_id in provider_models:
                return build_model_ref(provider_id, model_id)
            return build_model_ref(provider_id, provider_models[0])

    for provider in provider_entries:
        if not provider.get("configured"):
            continue
        models = provider.get("models") or []
        if models:
            return build_model_ref(provider["provider_id"], models[0]["model"])
    return fallback_ref


def get_default_text_model_ref(*, force_refresh: bool = False) -> str:
    return build_model_catalog(force_refresh=force_refresh)["default_text_model_ref"]


def get_default_video_model_name(*, force_refresh: bool = False) -> str:
    _provider_id, model_id = split_model_ref(get_default_video_model_ref(force_refresh=force_refresh), default_provider="local")
    return model_id


def get_default_video_model_ref(*, force_refresh: bool = False) -> str:
    return build_model_catalog(force_refresh=force_refresh)["default_video_model_ref"]


def build_model_catalog(*, force_refresh: bool = False) -> dict[str, Any]:
    saved_settings = load_app_settings()
    saved_providers = _get_saved_provider_configs(saved_settings)
    runtime_config = get_local_gateway_runtime_config(force_refresh=force_refresh)

    provider_ids: list[str] = []
    for template in list_provider_templates():
        provider_id = str(template.get("provider_id") or "").strip()
        if provider_id:
            provider_ids.append(provider_id)
    for provider_id in saved_providers:
        if provider_id not in provider_ids:
            provider_ids.append(provider_id)

    provider_entries: list[dict[str, Any]] = []
    local_text_model = ""
    for provider_id in provider_ids:
        provider = _normalize_provider_config(provider_id, saved_providers.get(provider_id), runtime_config=runtime_config)
        if provider_id == "local":
            catalog_models, local_text_model = _build_local_provider_models(
                provider,
                saved_settings=saved_settings,
                runtime_config=runtime_config,
                force_refresh=force_refresh,
            )
        else:
            model_items = _discover_provider_model_items(provider, force_refresh=force_refresh)
            catalog_models = [_build_catalog_model(provider_id, model) for model in model_items]
        provider_entries.append(_build_provider_entry(provider, models=catalog_models, runtime_config=runtime_config))

    if not local_text_model:
        local_text_model = get_default_text_model(force_refresh=False)
    fallback_text_ref = build_model_ref("local", local_text_model)
    saved_text_model_ref = str(saved_settings.get("text_model_ref") or "").strip()
    saved_video_model_ref = str(saved_settings.get("video_model_ref") or "").strip()
    env_video_model = (
        os.environ.get("LOCAL_VIDEO_MODEL")
        or os.environ.get("VIDEO_MODEL")
        or os.environ.get("LOCAL_MODEL_NAME")
        or os.environ.get("UPSTREAM_MODEL_NAME")
        or local_text_model
    )

    return {
        "default_text_model_ref": _resolve_default_model_ref(
            saved_text_model_ref,
            provider_entries,
            fallback_ref=fallback_text_ref,
        ),
        "default_video_model_ref": _resolve_default_model_ref(
            saved_video_model_ref,
            provider_entries,
            fallback_ref=build_model_ref("local", env_video_model),
        ),
        "providers": provider_entries,
        "provider_templates": list_provider_templates(),
    }

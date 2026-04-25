from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from fastapi import APIRouter, HTTPException

from app.core.model_catalog import (
    build_model_catalog,
    get_default_text_model_ref,
    get_default_video_model_ref,
    normalize_model_ref,
    resolve_runtime_model_name,
)
from app.core.storage.settings_store import load_app_settings, save_app_settings
from app.tools.local_llm import (
    discover_openai_compatible_models,
    get_default_agent_temperature,
    get_default_agent_thinking_enabled,
)
from app.tools.registry import get_tool_registry


router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsModelPayload(BaseModel):
    text_model_ref: str = Field(alias="text_model_ref", min_length=1)
    video_model_ref: str = Field(alias="video_model_ref", min_length=1)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class AgentRuntimeDefaultsPayload(BaseModel):
    model: str = Field(min_length=1)
    thinking_enabled: bool = Field(alias="thinking_enabled")
    temperature: float = Field(ge=0, le=2)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SettingsProviderModelPayload(BaseModel):
    model: str = Field(min_length=1)
    label: str | None = None

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SettingsModelProviderPayload(BaseModel):
    label: str | None = None
    base_url: str = Field(alias="base_url", min_length=1)
    api_key: str | None = Field(default=None, alias="api_key")
    models: list[SettingsProviderModelPayload] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SettingsUpdatePayload(BaseModel):
    model: SettingsModelPayload
    agent_runtime_defaults: AgentRuntimeDefaultsPayload = Field(alias="agent_runtime_defaults")
    model_providers: dict[str, SettingsModelProviderPayload] | None = Field(default=None, alias="model_providers")

    model_config = ConfigDict(populate_by_name=True)


class ModelDiscoveryPayload(BaseModel):
    base_url: str = Field(alias="base_url", min_length=1)
    api_key: str = Field(default="", alias="api_key")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


def _merge_model_providers(
    existing_settings: dict,
    incoming_providers: dict[str, SettingsModelProviderPayload] | None,
) -> dict:
    if incoming_providers is None:
        return existing_settings

    next_settings = dict(existing_settings)
    existing_providers = next_settings.get("model_providers")
    merged_providers = dict(existing_providers) if isinstance(existing_providers, dict) else {}

    for provider_id, provider_payload in incoming_providers.items():
        provider_key = str(provider_id or "").strip()
        if not provider_key:
            continue

        existing_provider = merged_providers.get(provider_key)
        existing_provider = existing_provider if isinstance(existing_provider, dict) else {}
        incoming_api_key = str(provider_payload.api_key or "").strip()

        provider_config = {
            "label": provider_payload.label or existing_provider.get("label") or provider_key,
            "base_url": str(provider_payload.base_url).strip().rstrip("/"),
            "models": [
                {
                    "model": model_payload.model,
                    "label": model_payload.label or model_payload.model,
                }
                for model_payload in provider_payload.models
            ],
        }

        if incoming_api_key:
            provider_config["api_key"] = incoming_api_key
        elif existing_provider.get("api_key"):
            provider_config["api_key"] = existing_provider["api_key"]

        merged_providers[provider_key] = provider_config

    next_settings["model_providers"] = merged_providers
    return next_settings


def _build_settings_payload(*, force_refresh_models: bool = False) -> dict:
    text_model_ref = get_default_text_model_ref(force_refresh=force_refresh_models)
    video_model_ref = get_default_video_model_ref(force_refresh=force_refresh_models)
    model_catalog = build_model_catalog(force_refresh=force_refresh_models)
    return {
        "model": {
            "text_model": resolve_runtime_model_name(text_model_ref),
            "text_model_ref": text_model_ref,
            "video_model": resolve_runtime_model_name(video_model_ref),
            "video_model_ref": video_model_ref,
        },
        "agent_runtime_defaults": {
            "model": text_model_ref,
            "thinking_enabled": get_default_agent_thinking_enabled(),
            "temperature": get_default_agent_temperature(),
        },
        "model_catalog": model_catalog,
        "revision": {
            "max_revision_round": 1,
        },
        "evaluator": {
            "default_score_threshold": 7.8,
            "routes": ["pass", "revise", "fail"],
        },
        "tools": sorted(get_tool_registry().keys()),
    }


@router.get("")
def get_settings_endpoint() -> dict:
    return _build_settings_payload(force_refresh_models=True)


@router.post("")
def update_settings_endpoint(payload: SettingsUpdatePayload) -> dict:
    normalized_text_model_ref = normalize_model_ref(payload.model.text_model_ref, default_provider="local")
    normalized_video_model_ref = normalize_model_ref(payload.model.video_model_ref, default_provider="local")
    normalized_agent_model_ref = normalize_model_ref(payload.agent_runtime_defaults.model, default_provider="local")

    if normalized_agent_model_ref != normalized_text_model_ref:
        normalized_text_model_ref = normalized_agent_model_ref

    existing_settings = load_app_settings()
    next_settings = _merge_model_providers(existing_settings, payload.model_providers)
    next_settings.update(
        {
            "text_model_ref": normalized_text_model_ref,
            "video_model_ref": normalized_video_model_ref,
            "agent_runtime_defaults": {
                "thinking_enabled": payload.agent_runtime_defaults.thinking_enabled,
                "temperature": float(payload.agent_runtime_defaults.temperature),
            },
        }
    )
    save_app_settings(next_settings)
    return _build_settings_payload(force_refresh_models=True)


@router.post("/model-providers/discover")
def discover_model_provider_models_endpoint(payload: ModelDiscoveryPayload) -> dict:
    try:
        models = discover_openai_compatible_models(base_url=payload.base_url, api_key=payload.api_key)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"models": models}

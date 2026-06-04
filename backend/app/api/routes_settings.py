from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from fastapi import APIRouter, HTTPException

from app.core.model_catalog import (
    build_model_catalog,
    get_default_text_model_ref,
    get_default_video_model_ref,
    normalize_model_embedding_settings,
    normalize_model_ref,
    resolve_runtime_model_name,
)
from app.core.model_provider_costs import normalize_provider_model_pricing
from app.core.model_provider_credentials import (
    normalize_provider_credential_pool,
    preserve_provider_credential_pool_secrets,
)
from app.core.model_provider_templates import get_provider_template, normalize_transport
from app.core.storage.model_log_store import (
    get_model_log_retention_settings,
    normalize_model_log_retention_root_runs,
    save_model_log_retention_settings,
)
from app.core.storage.provider_prompt_cache_store import (
    normalize_provider_prompt_cache_resource_retention_days,
)
from app.core.storage.embedding_model_sync import sync_default_embedding_model_from_settings
from app.core.storage.settings_store import load_app_settings, save_app_settings
from app.core.runtime.structured_output import normalize_structured_output_mode
from app.tools.local_llm import (
    get_default_agent_temperature,
    get_default_agent_thinking_level,
)
from app.core.thinking_levels import THINKING_LEVEL_HIGH, THINKING_LEVEL_OFF, normalize_thinking_level
from app.tools.model_provider_client import discover_provider_model_items
from app.tools.model_provider_http import normalize_request_timeout_seconds
from app.tools.openai_codex_client import (
    clear_codex_auth_state,
    get_codex_auth_status,
    import_codex_cli_auth_state,
    poll_codex_device_login,
    poll_codex_browser_login,
    start_codex_browser_login,
    start_codex_device_login,
)
from app.tools.registry import get_tool_registry


router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsModelPayload(BaseModel):
    text_model_ref: str = Field(alias="text_model_ref")
    video_model_ref: str = Field(alias="video_model_ref")
    embedding_model_ref: str | None = Field(default=None, alias="embedding_model_ref")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class AgentRuntimeDefaultsPayload(BaseModel):
    model: str
    thinking_enabled: bool | None = Field(default=None, alias="thinking_enabled")
    thinking_level: str | None = Field(default=None, alias="thinking_level")
    temperature: float = Field(ge=0, le=2)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @property
    def normalized_thinking_level(self) -> str:
        if self.thinking_level is not None:
            return normalize_thinking_level(self.thinking_level)
        if self.thinking_enabled is not None:
            return THINKING_LEVEL_HIGH if self.thinking_enabled else THINKING_LEVEL_OFF
        return THINKING_LEVEL_OFF


class SettingsProviderModelEmbeddingPayload(BaseModel):
    dimensions: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(populate_by_name=True)


class SettingsProviderModelPayload(BaseModel):
    model: str = Field(min_length=1)
    label: str | None = None
    route_target: str | None = Field(default=None, alias="route_target")
    reasoning: bool | None = None
    modalities: list[str] = Field(default_factory=lambda: ["text"])
    capabilities: dict[str, bool] = Field(default_factory=dict)
    embedding: SettingsProviderModelEmbeddingPayload | None = None
    permissions: list[str] = Field(default_factory=list)
    pricing: dict[str, object] | None = None
    context_window: int | None = Field(default=None, alias="context_window")
    max_tokens: int | None = Field(default=None, alias="max_tokens")
    compression_threshold: float | None = Field(default=None, alias="compression_threshold", ge=0.01, le=1.0)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SettingsProviderCredentialPayload(BaseModel):
    credential_id: str = Field(alias="credential_id", min_length=1)
    api_key: str | None = Field(default=None, alias="api_key")
    status: str = "active"
    cooldown_until: str | None = Field(default=None, alias="cooldown_until")
    failure_count: int = Field(default=0, alias="failure_count", ge=0)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class SettingsModelProviderPayload(BaseModel):
    label: str | None = None
    transport: str = Field(default="openai-compatible")
    base_url: str = Field(default="", alias="base_url")
    api_key: str | None = Field(default=None, alias="api_key")
    enabled: bool = True
    auth_header: str | None = Field(default=None, alias="auth_header")
    auth_scheme: str | None = Field(default=None, alias="auth_scheme")
    auth_mode: str | None = Field(default=None, alias="auth_mode")
    request_timeout_seconds: float | None = Field(default=None, alias="request_timeout_seconds", ge=1, le=3600)
    structured_output_mode: str | None = Field(default=None, alias="structured_output_mode")
    credential_pool: list[SettingsProviderCredentialPayload] | None = Field(default=None, alias="credential_pool")
    models: list[SettingsProviderModelPayload] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


BUDDY_PERMISSION_MODE_ASK_FIRST = "ask_first"
BUDDY_PERMISSION_MODE_FULL_ACCESS = "full_access"
BUDDY_PERMISSION_MODE_DEFAULT = BUDDY_PERMISSION_MODE_ASK_FIRST


class BuddyRuntimeSettingsPayload(BaseModel):
    permission_mode: str = Field(default=BUDDY_PERMISSION_MODE_DEFAULT, alias="permission_mode")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @property
    def normalized_permission_mode(self) -> str:
        return normalize_buddy_permission_mode(self.permission_mode)


class ModelLogSettingsPayload(BaseModel):
    max_root_runs: int = Field(default=200, alias="max_root_runs")
    cache_resource_retention_days: int | None = Field(default=None, alias="cache_resource_retention_days")

    model_config = ConfigDict(populate_by_name=True)

    @property
    def normalized_max_root_runs(self) -> int:
        return normalize_model_log_retention_root_runs(self.max_root_runs)

    @property
    def normalized_cache_resource_retention_days(self) -> int | None:
        if self.cache_resource_retention_days is None:
            return None
        return normalize_provider_prompt_cache_resource_retention_days(self.cache_resource_retention_days)


class UiPreferencesPayload(BaseModel):
    developer_mode: bool = Field(default=False, alias="developer_mode")

    model_config = ConfigDict(populate_by_name=True)


class SettingsUpdatePayload(BaseModel):
    model: SettingsModelPayload
    agent_runtime_defaults: AgentRuntimeDefaultsPayload = Field(alias="agent_runtime_defaults")
    model_providers: dict[str, SettingsModelProviderPayload] | None = Field(default=None, alias="model_providers")
    buddy_runtime: BuddyRuntimeSettingsPayload | None = Field(default=None, alias="buddy_runtime")
    model_logs: ModelLogSettingsPayload | None = Field(default=None, alias="model_logs")
    ui_preferences: UiPreferencesPayload | None = Field(default=None, alias="ui_preferences")

    model_config = ConfigDict(populate_by_name=True)


class ModelDiscoveryPayload(BaseModel):
    provider_id: str = Field(default="custom", alias="provider_id")
    transport: str = Field(default="openai-compatible")
    base_url: str = Field(alias="base_url", min_length=1)
    api_key: str = Field(default="", alias="api_key")
    auth_header: str | None = Field(default=None, alias="auth_header")
    auth_scheme: str | None = Field(default=None, alias="auth_scheme")
    request_timeout_seconds: float | None = Field(default=None, alias="request_timeout_seconds", ge=1, le=3600)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class CodexAuthPollPayload(BaseModel):
    device_auth_id: str = Field(alias="device_auth_id", min_length=1)
    user_code: str = Field(alias="user_code", min_length=1)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class CodexBrowserAuthPollPayload(BaseModel):
    state: str = Field(min_length=1)

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


def normalize_buddy_permission_mode(value: object) -> str:
    mode = str(value or "").strip()
    if mode in {BUDDY_PERMISSION_MODE_FULL_ACCESS, "unrestricted"}:
        return BUDDY_PERMISSION_MODE_FULL_ACCESS
    return BUDDY_PERMISSION_MODE_ASK_FIRST


def _normalize_buddy_runtime_settings(value: object) -> dict[str, str]:
    payload = value if isinstance(value, dict) else {}
    return {
        "permission_mode": normalize_buddy_permission_mode(payload.get("permission_mode")),
    }


def get_saved_buddy_runtime_settings(settings: dict | None = None) -> dict[str, str]:
    source = settings if isinstance(settings, dict) else load_app_settings()
    raw_runtime = source.get("buddy_runtime")
    if isinstance(raw_runtime, dict) and "permission_mode" in raw_runtime:
        return _normalize_buddy_runtime_settings(raw_runtime)
    if "buddy_permission_mode" in source:
        return {"permission_mode": normalize_buddy_permission_mode(source.get("buddy_permission_mode"))}
    return {"permission_mode": BUDDY_PERMISSION_MODE_DEFAULT}


def save_buddy_runtime_settings(payload: BuddyRuntimeSettingsPayload) -> dict[str, str]:
    existing_settings = load_app_settings()
    next_settings = dict(existing_settings)
    next_settings.pop("buddy_permission_mode", None)
    next_settings["buddy_runtime"] = {"permission_mode": payload.normalized_permission_mode}
    save_app_settings(next_settings)
    return get_saved_buddy_runtime_settings(next_settings)


def get_saved_ui_preferences(settings: dict | None = None) -> dict[str, bool]:
    source = settings if isinstance(settings, dict) else load_app_settings()
    raw_preferences = source.get("ui_preferences") if isinstance(source, dict) else {}
    preferences = raw_preferences if isinstance(raw_preferences, dict) else {}
    return {"developer_mode": bool(preferences.get("developer_mode", False))}


def _merge_model_providers(
    existing_settings: dict,
    incoming_providers: dict[str, SettingsModelProviderPayload] | None,
) -> dict:
    if incoming_providers is None:
        return existing_settings

    next_settings = dict(existing_settings)
    existing_providers = next_settings.get("model_providers")
    existing_providers = existing_providers if isinstance(existing_providers, dict) else {}
    merged_providers: dict[str, dict[str, object]] = {}

    for provider_id, provider_payload in incoming_providers.items():
        provider_key = str(provider_id or "").strip()
        if not provider_key:
            continue

        template = get_provider_template(provider_key)
        existing_provider = existing_providers.get(provider_key)
        existing_provider = existing_provider if isinstance(existing_provider, dict) else {}
        incoming_api_key = str(provider_payload.api_key or "").strip()
        transport = normalize_transport(provider_payload.transport or existing_provider.get("transport") or template["transport"])
        auth_scheme = (
            provider_payload.auth_scheme
            if provider_payload.auth_scheme is not None
            else existing_provider.get("auth_scheme")
            if "auth_scheme" in existing_provider
            else template.get("auth_scheme", "Bearer")
        )
        existing_models = existing_provider.get("models") if isinstance(existing_provider.get("models"), list) else []
        existing_models_by_name = {
            str(model.get("model") or "").strip().lower(): model
            for model in existing_models
            if isinstance(model, dict) and str(model.get("model") or "").strip()
        }
        model_configs: list[dict[str, object]] = []
        for model_payload in provider_payload.models:
            existing_model = existing_models_by_name.get(str(model_payload.model or "").strip().lower(), {})
            capabilities = {
                str(key): bool(value)
                for key, value in model_payload.capabilities.items()
                if str(key or "").strip()
            }
            model_config: dict[str, object] = {
                "model": model_payload.model,
                "label": model_payload.label or model_payload.model,
                "route_target": model_payload.route_target or "",
                "reasoning": model_payload.reasoning,
                "modalities": model_payload.modalities or ["text"],
                "capabilities": capabilities,
                "permissions": _dedupe_strings(model_payload.permissions),
                "context_window": model_payload.context_window,
                "max_tokens": model_payload.max_tokens,
                "compression_threshold": model_payload.compression_threshold,
            }
            if capabilities.get("embedding"):
                embedding_source = (
                    model_payload.embedding.model_dump(by_alias=True)
                    if model_payload.embedding is not None
                    else existing_model.get("embedding")
                )
                model_config["embedding"] = normalize_model_embedding_settings(embedding_source)
            pricing = normalize_provider_model_pricing(
                model_payload.pricing if model_payload.pricing is not None else existing_model.get("pricing")
            )
            if pricing:
                model_config["pricing"] = pricing
            model_configs.append(model_config)

        provider_config = {
            "label": provider_payload.label or existing_provider.get("label") or template.get("label") or provider_key,
            "transport": transport,
            "base_url": str(provider_payload.base_url).strip().rstrip("/"),
            "enabled": bool(provider_payload.enabled),
            "auth_mode": provider_payload.auth_mode or existing_provider.get("auth_mode") or template.get("auth_mode") or "api_key",
            "auth_header": provider_payload.auth_header
            or existing_provider.get("auth_header")
            or template.get("auth_header")
            or "Authorization",
            "auth_scheme": "" if auth_scheme is None else str(auth_scheme),
            "request_timeout_seconds": normalize_request_timeout_seconds(
                provider_payload.request_timeout_seconds
                if provider_payload.request_timeout_seconds is not None
                else existing_provider.get("request_timeout_seconds") or template.get("request_timeout_seconds")
            ),
            "structured_output_mode": normalize_structured_output_mode(
                provider_payload.structured_output_mode
                if provider_payload.structured_output_mode is not None
                else existing_provider.get("structured_output_mode") or template.get("structured_output_mode")
            ),
            "models": model_configs,
        }

        credential_pool_source = (
            [
                credential.model_dump(by_alias=True)
                for credential in provider_payload.credential_pool
            ]
            if provider_payload.credential_pool is not None
            else existing_provider.get("credential_pool")
        )
        credential_pool = normalize_provider_credential_pool(credential_pool_source, include_secrets=True)
        if provider_payload.credential_pool is not None:
            credential_pool = preserve_provider_credential_pool_secrets(
                credential_pool,
                existing_provider.get("credential_pool"),
            )
        if credential_pool:
            provider_config["credential_pool"] = credential_pool

        if incoming_api_key:
            provider_config["api_key"] = incoming_api_key
        elif existing_provider.get("api_key"):
            provider_config["api_key"] = existing_provider["api_key"]

        merged_providers[provider_key] = provider_config

    next_settings["model_providers"] = merged_providers
    return next_settings


def _dedupe_strings(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _build_settings_payload(*, force_refresh_models: bool = False) -> dict:
    model_catalog = build_model_catalog(force_refresh=force_refresh_models)
    text_model_ref = str(model_catalog.get("default_text_model_ref") or get_default_text_model_ref(force_refresh=False))
    video_model_ref = str(model_catalog.get("default_video_model_ref") or get_default_video_model_ref(force_refresh=False))
    embedding_model_ref = str(model_catalog.get("default_embedding_model_ref") or "")
    agent_thinking_level = normalize_thinking_level(get_default_agent_thinking_level())
    return {
        "model": {
            "text_model": resolve_runtime_model_name(text_model_ref),
            "text_model_ref": text_model_ref,
            "video_model": resolve_runtime_model_name(video_model_ref),
            "video_model_ref": video_model_ref,
            "embedding_model": resolve_runtime_model_name(embedding_model_ref) if embedding_model_ref else "",
            "embedding_model_ref": embedding_model_ref,
        },
        "agent_runtime_defaults": {
            "model": text_model_ref,
            "thinking_enabled": agent_thinking_level != THINKING_LEVEL_OFF,
            "thinking_level": agent_thinking_level,
            "temperature": get_default_agent_temperature(),
        },
        "model_catalog": model_catalog,
        "revision": {
            "max_revision_round": 1,
        },
        "tools": sorted(get_tool_registry().keys()),
        "buddy_runtime": get_saved_buddy_runtime_settings(),
        "model_logs": get_model_log_retention_settings(),
        "ui_preferences": get_saved_ui_preferences(),
    }


def _normalize_optional_model_ref(model_ref: str | None, *, default_provider: str = "local") -> str:
    trimmed = str(model_ref or "").strip()
    if not trimmed:
        return ""
    return normalize_model_ref(trimmed, default_provider=default_provider)


@router.get("")
def get_settings_endpoint() -> dict:
    return _build_settings_payload(force_refresh_models=False)


@router.post("")
def update_settings_endpoint(payload: SettingsUpdatePayload) -> dict:
    existing_settings = load_app_settings()
    normalized_text_model_ref = _normalize_optional_model_ref(payload.model.text_model_ref, default_provider="local")
    normalized_video_model_ref = _normalize_optional_model_ref(payload.model.video_model_ref, default_provider="local")
    normalized_embedding_model_ref = (
        _normalize_optional_model_ref(payload.model.embedding_model_ref, default_provider="local")
        if payload.model.embedding_model_ref is not None
        else _normalize_optional_model_ref(str(existing_settings.get("embedding_model_ref") or ""), default_provider="local")
    )
    normalized_agent_model_ref = _normalize_optional_model_ref(payload.agent_runtime_defaults.model, default_provider="local")

    if normalized_agent_model_ref and normalized_agent_model_ref != normalized_text_model_ref:
        normalized_text_model_ref = normalized_agent_model_ref

    next_settings = _merge_model_providers(existing_settings, payload.model_providers)
    next_settings.update(
        {
            "text_model_ref": normalized_text_model_ref,
            "video_model_ref": normalized_video_model_ref,
            "embedding_model_ref": normalized_embedding_model_ref,
            "agent_runtime_defaults": {
                "thinking_enabled": payload.agent_runtime_defaults.normalized_thinking_level != THINKING_LEVEL_OFF,
                "thinking_level": payload.agent_runtime_defaults.normalized_thinking_level,
                "temperature": float(payload.agent_runtime_defaults.temperature),
            },
        }
    )
    existing_buddy_runtime = get_saved_buddy_runtime_settings(existing_settings)
    next_settings["buddy_runtime"] = (
        {"permission_mode": payload.buddy_runtime.normalized_permission_mode}
        if payload.buddy_runtime is not None
        else existing_buddy_runtime
    )
    if payload.model_logs is not None:
        existing_model_log_retention = get_model_log_retention_settings(existing_settings)
        cache_resource_retention_days = payload.model_logs.normalized_cache_resource_retention_days
        next_settings["model_logs"] = {
            "max_root_runs": payload.model_logs.normalized_max_root_runs,
            "cache_resource_retention_days": (
                cache_resource_retention_days
                if cache_resource_retention_days is not None
                else existing_model_log_retention["cache_resource_retention_days"]
            ),
        }
    elif "model_logs" in existing_settings:
        next_settings["model_logs"] = get_model_log_retention_settings(existing_settings)
    next_settings["ui_preferences"] = (
        {"developer_mode": bool(payload.ui_preferences.developer_mode)}
        if payload.ui_preferences is not None
        else get_saved_ui_preferences(existing_settings)
    )
    next_settings.pop("buddy_permission_mode", None)
    saved_settings = save_app_settings(next_settings)
    sync_default_embedding_model_from_settings(saved_settings, normalized_embedding_model_ref)
    return _build_settings_payload(force_refresh_models=False)


@router.get("/buddy-runtime")
def get_buddy_runtime_settings_endpoint() -> dict[str, str]:
    return get_saved_buddy_runtime_settings()


@router.post("/buddy-runtime")
def update_buddy_runtime_settings_endpoint(payload: BuddyRuntimeSettingsPayload) -> dict[str, str]:
    return save_buddy_runtime_settings(payload)


@router.get("/model-logs")
def get_model_log_settings_endpoint() -> dict[str, int]:
    return get_model_log_retention_settings()


@router.post("/model-logs")
def update_model_log_settings_endpoint(payload: ModelLogSettingsPayload) -> dict[str, int]:
    return save_model_log_retention_settings(
        max_root_runs=payload.normalized_max_root_runs,
        cache_resource_retention_days=payload.normalized_cache_resource_retention_days,
    )


@router.post("/model-providers/discover")
def discover_model_provider_models_endpoint(payload: ModelDiscoveryPayload) -> dict:
    try:
        template = get_provider_template(payload.provider_id)
        model_items = discover_provider_model_items(
            provider_id=payload.provider_id,
            transport=payload.transport,
            base_url=payload.base_url,
            api_key=payload.api_key,
            auth_header=payload.auth_header or template.get("auth_header") or "Authorization",
            auth_scheme=payload.auth_scheme if payload.auth_scheme is not None else str(template.get("auth_scheme") or "Bearer"),
            timeout_sec=normalize_request_timeout_seconds(payload.request_timeout_seconds, default=8.0),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    models = [
        str(item.get("model") or "").strip()
        for item in model_items
        if isinstance(item, dict) and str(item.get("model") or "").strip()
    ]
    return {"models": models, "model_items": model_items}


@router.get("/model-providers/openai-codex/auth/status")
def get_openai_codex_auth_status_endpoint() -> dict:
    return get_codex_auth_status()


@router.post("/model-providers/openai-codex/auth/start")
def start_openai_codex_auth_endpoint() -> dict:
    try:
        return start_codex_device_login()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/model-providers/openai-codex/auth/browser/start")
def start_openai_codex_browser_auth_endpoint() -> dict:
    try:
        return start_codex_browser_login()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/model-providers/openai-codex/auth/browser/poll")
def poll_openai_codex_browser_auth_endpoint(payload: CodexBrowserAuthPollPayload) -> dict:
    try:
        return poll_codex_browser_login(state=payload.state)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/model-providers/openai-codex/auth/codex-cli/import")
def import_openai_codex_cli_auth_endpoint() -> dict:
    try:
        return import_codex_cli_auth_state()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/model-providers/openai-codex/auth/poll")
def poll_openai_codex_auth_endpoint(payload: CodexAuthPollPayload) -> dict:
    try:
        return poll_codex_device_login(device_auth_id=payload.device_auth_id, user_code=payload.user_code)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/model-providers/openai-codex/auth/logout")
def logout_openai_codex_auth_endpoint() -> dict:
    clear_codex_auth_state()
    return {"configured": False, "authenticated": False}

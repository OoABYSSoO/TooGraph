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
from app.core.model_provider_templates import get_provider_template, normalize_transport
from app.core.storage.settings_store import load_app_settings, save_app_settings
from app.tools.local_llm import (
    get_default_agent_temperature,
    get_default_agent_thinking_level,
)
from app.core.thinking_levels import THINKING_LEVEL_HIGH, THINKING_LEVEL_OFF, normalize_thinking_level
from app.tools.model_provider_client import discover_provider_models
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


class SettingsProviderModelPayload(BaseModel):
    model: str = Field(min_length=1)
    label: str | None = None
    route_target: str | None = Field(default=None, alias="route_target")
    reasoning: bool | None = None
    modalities: list[str] = Field(default_factory=lambda: ["text"])
    capabilities: dict[str, bool] = Field(default_factory=dict)
    permissions: list[str] = Field(default_factory=list)
    context_window: int | None = Field(default=None, alias="context_window")
    max_tokens: int | None = Field(default=None, alias="max_tokens")

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


class SettingsUpdatePayload(BaseModel):
    model: SettingsModelPayload
    agent_runtime_defaults: AgentRuntimeDefaultsPayload = Field(alias="agent_runtime_defaults")
    model_providers: dict[str, SettingsModelProviderPayload] | None = Field(default=None, alias="model_providers")
    buddy_runtime: BuddyRuntimeSettingsPayload | None = Field(default=None, alias="buddy_runtime")

    model_config = ConfigDict(populate_by_name=True)


class ModelDiscoveryPayload(BaseModel):
    provider_id: str = Field(default="custom", alias="provider_id")
    transport: str = Field(default="openai-compatible")
    base_url: str = Field(alias="base_url", min_length=1)
    api_key: str = Field(default="", alias="api_key")
    auth_header: str | None = Field(default=None, alias="auth_header")
    auth_scheme: str | None = Field(default=None, alias="auth_scheme")

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

        template = get_provider_template(provider_key)
        existing_provider = merged_providers.get(provider_key)
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
            "models": [
                {
                    "model": model_payload.model,
                    "label": model_payload.label or model_payload.model,
                    "route_target": model_payload.route_target or "",
                    "reasoning": model_payload.reasoning,
                    "modalities": model_payload.modalities or ["text"],
                    "capabilities": {
                        str(key): bool(value)
                        for key, value in model_payload.capabilities.items()
                        if str(key or "").strip()
                    },
                    "permissions": _dedupe_strings(model_payload.permissions),
                    "context_window": model_payload.context_window,
                    "max_tokens": model_payload.max_tokens,
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
    agent_thinking_level = normalize_thinking_level(get_default_agent_thinking_level())
    return {
        "model": {
            "text_model": resolve_runtime_model_name(text_model_ref),
            "text_model_ref": text_model_ref,
            "video_model": resolve_runtime_model_name(video_model_ref),
            "video_model_ref": video_model_ref,
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
        "evaluator": {
            "default_score_threshold": 7.8,
            "routes": ["pass", "revise", "fail"],
        },
        "tools": sorted(get_tool_registry().keys()),
        "buddy_runtime": get_saved_buddy_runtime_settings(),
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
    normalized_text_model_ref = _normalize_optional_model_ref(payload.model.text_model_ref, default_provider="local")
    normalized_video_model_ref = _normalize_optional_model_ref(payload.model.video_model_ref, default_provider="local")
    normalized_agent_model_ref = _normalize_optional_model_ref(payload.agent_runtime_defaults.model, default_provider="local")

    if normalized_agent_model_ref and normalized_agent_model_ref != normalized_text_model_ref:
        normalized_text_model_ref = normalized_agent_model_ref

    existing_settings = load_app_settings()
    next_settings = _merge_model_providers(existing_settings, payload.model_providers)
    next_settings.update(
        {
            "text_model_ref": normalized_text_model_ref,
            "video_model_ref": normalized_video_model_ref,
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
    next_settings.pop("buddy_permission_mode", None)
    save_app_settings(next_settings)
    return _build_settings_payload(force_refresh_models=False)


@router.get("/buddy-runtime")
def get_buddy_runtime_settings_endpoint() -> dict[str, str]:
    return get_saved_buddy_runtime_settings()


@router.post("/buddy-runtime")
def update_buddy_runtime_settings_endpoint(payload: BuddyRuntimeSettingsPayload) -> dict[str, str]:
    return save_buddy_runtime_settings(payload)


@router.post("/model-providers/discover")
def discover_model_provider_models_endpoint(payload: ModelDiscoveryPayload) -> dict:
    try:
        template = get_provider_template(payload.provider_id)
        models = discover_provider_models(
            provider_id=payload.provider_id,
            transport=payload.transport,
            base_url=payload.base_url,
            api_key=payload.api_key,
            auth_header=payload.auth_header or template.get("auth_header") or "Authorization",
            auth_scheme=payload.auth_scheme if payload.auth_scheme is not None else str(template.get("auth_scheme") or "Bearer"),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"models": models}


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

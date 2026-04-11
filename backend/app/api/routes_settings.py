from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from fastapi import APIRouter

from app.core.model_catalog import (
    build_model_catalog,
    get_default_text_model_ref,
    get_default_video_model_ref,
    normalize_model_ref,
    resolve_runtime_model_name,
)
from app.core.storage.settings_store import save_app_settings
from app.skills.definitions import get_skill_definition_registry
from app.templates.registry import list_templates
from app.tools.local_llm import (
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


class SettingsUpdatePayload(BaseModel):
    model: SettingsModelPayload
    agent_runtime_defaults: AgentRuntimeDefaultsPayload = Field(alias="agent_runtime_defaults")

    model_config = ConfigDict(populate_by_name=True)


def _build_settings_payload() -> dict:
    text_model_ref = get_default_text_model_ref()
    video_model_ref = get_default_video_model_ref()
    model_catalog = build_model_catalog()
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
        "skill_definitions": sorted(get_skill_definition_registry(include_disabled=False).keys()),
        "templates": [
            {
                "template_id": template["template_id"],
                "label": template["label"],
                "default_theme_preset": template["default_theme_preset"],
            }
            for template in list_templates()
        ],
    }


@router.get("")
def get_settings_endpoint() -> dict:
    return _build_settings_payload()


@router.post("")
def update_settings_endpoint(payload: SettingsUpdatePayload) -> dict:
    normalized_text_model_ref = normalize_model_ref(payload.model.text_model_ref, default_provider="local")
    normalized_video_model_ref = normalize_model_ref(payload.model.video_model_ref, default_provider="local")
    normalized_agent_model_ref = normalize_model_ref(payload.agent_runtime_defaults.model, default_provider="local")

    if normalized_agent_model_ref != normalized_text_model_ref:
        normalized_text_model_ref = normalized_agent_model_ref

    save_app_settings(
        {
            "text_model_ref": normalized_text_model_ref,
            "video_model_ref": normalized_video_model_ref,
            "agent_runtime_defaults": {
                "thinking_enabled": payload.agent_runtime_defaults.thinking_enabled,
                "temperature": float(payload.agent_runtime_defaults.temperature),
            },
        }
    )
    return _build_settings_payload()

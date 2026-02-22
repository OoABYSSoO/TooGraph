from __future__ import annotations

from typing import Any

from app.core.model_provider_templates import (
    TRANSPORT_ANTHROPIC_MESSAGES,
    TRANSPORT_CODEX_RESPONSES,
    TRANSPORT_GEMINI_GENERATE_CONTENT,
    TRANSPORT_OPENAI_COMPATIBLE,
)


THINKING_LEVEL_OFF = "off"
THINKING_LEVEL_LOW = "low"
THINKING_LEVEL_MEDIUM = "medium"
THINKING_LEVEL_HIGH = "high"
THINKING_LEVEL_XHIGH = "xhigh"
THINKING_LEVELS = {
    THINKING_LEVEL_OFF,
    THINKING_LEVEL_LOW,
    THINKING_LEVEL_MEDIUM,
    THINKING_LEVEL_HIGH,
    THINKING_LEVEL_XHIGH,
}

LEGACY_THINKING_LEVELS = {
    "on": THINKING_LEVEL_MEDIUM,
    "enable": THINKING_LEVEL_MEDIUM,
    "enabled": THINKING_LEVEL_MEDIUM,
    "true": THINKING_LEVEL_MEDIUM,
    "yes": THINKING_LEVEL_MEDIUM,
    "auto": THINKING_LEVEL_OFF,
    "default": THINKING_LEVEL_OFF,
    "inherit": THINKING_LEVEL_OFF,
    "minimal": THINKING_LEVEL_LOW,
    "": THINKING_LEVEL_OFF,
}

THINKING_BUDGET_TOKENS = {
    THINKING_LEVEL_LOW: 400,
    THINKING_LEVEL_MEDIUM: 1024,
    THINKING_LEVEL_HIGH: 4096,
    THINKING_LEVEL_XHIGH: 16384,
}


def normalize_thinking_level(raw: Any, *, fallback: str = THINKING_LEVEL_OFF) -> str:
    value = str(raw or "").strip().lower().replace("_", "-")
    compact = value.replace("-", "")
    if compact in {"xhigh", "extrahigh"}:
        return THINKING_LEVEL_XHIGH
    if value in THINKING_LEVELS:
        return value
    if value in LEGACY_THINKING_LEVELS:
        return LEGACY_THINKING_LEVELS[value]
    return fallback if fallback in THINKING_LEVELS else THINKING_LEVEL_OFF


def is_openai_reasoning_model(model: str) -> bool:
    model_id = str(model or "").strip().lower()
    if not model_id:
        return False
    return (
        model_id.startswith("gpt-5")
        or model_id.startswith("o1")
        or model_id.startswith("o3")
        or model_id.startswith("o4")
        or "codex" in model_id
    )


def is_anthropic_thinking_model(model: str) -> bool:
    model_id = str(model or "").strip().lower()
    return "claude-4" in model_id or "claude-sonnet-4" in model_id or "claude-opus-4" in model_id or "claude-3-7" in model_id


def is_gemini_thinking_model(model: str) -> bool:
    model_id = str(model or "").strip().lower()
    return "gemini-2.5" in model_id or "gemini-3" in model_id


def resolve_effective_thinking_level(
    *,
    configured_level: Any,
    provider_id: str,
    model: str,
    model_reasoning: bool | None = None,
) -> str:
    return normalize_thinking_level(configured_level)


def _map_openai_reasoning_effort(level: str, model: str) -> str | None:
    normalized = normalize_thinking_level(level, fallback=THINKING_LEVEL_OFF)
    if normalized == THINKING_LEVEL_OFF:
        return None
    if normalized == THINKING_LEVEL_XHIGH and not is_openai_reasoning_model(model):
        return THINKING_LEVEL_HIGH
    return normalized


def _map_openai_compatible_reasoning_effort(level: str) -> str | None:
    normalized = normalize_thinking_level(level, fallback=THINKING_LEVEL_OFF)
    if normalized == THINKING_LEVEL_OFF:
        return None
    if normalized == THINKING_LEVEL_XHIGH:
        return THINKING_LEVEL_HIGH
    return normalized


def build_native_thinking_payload(
    *,
    provider_id: str,
    transport: str,
    model: str,
    thinking_level: Any,
) -> dict[str, Any]:
    level = normalize_thinking_level(thinking_level, fallback=THINKING_LEVEL_OFF)
    if level == THINKING_LEVEL_OFF:
        return {}

    provider = str(provider_id or "").strip().lower()
    normalized_transport = str(transport or "").strip()

    if normalized_transport == TRANSPORT_CODEX_RESPONSES or provider == "openai-codex":
        effort = _map_openai_reasoning_effort(level, model)
        return {"reasoning": {"effort": effort}} if effort else {}

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE and provider == "openai" and is_openai_reasoning_model(model):
        effort = _map_openai_reasoning_effort(level, model)
        return {"reasoning_effort": effort} if effort else {}

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE and provider == "lmstudio":
        effort = _map_openai_compatible_reasoning_effort(level)
        return {"reasoning_effort": effort} if effort else {}

    if normalized_transport == TRANSPORT_OPENAI_COMPATIBLE and provider == "mistral" and str(model).lower().startswith("mistral-small"):
        effort = THINKING_LEVEL_HIGH if level == THINKING_LEVEL_XHIGH else level
        return {"reasoning_effort": effort}

    if normalized_transport == TRANSPORT_ANTHROPIC_MESSAGES and is_anthropic_thinking_model(model):
        budget = THINKING_BUDGET_TOKENS.get(level, THINKING_BUDGET_TOKENS[THINKING_LEVEL_MEDIUM])
        return {"thinking": {"type": "enabled", "budget_tokens": budget}}

    if normalized_transport == TRANSPORT_GEMINI_GENERATE_CONTENT and is_gemini_thinking_model(model):
        budget = THINKING_BUDGET_TOKENS.get(level, THINKING_BUDGET_TOKENS[THINKING_LEVEL_MEDIUM])
        return {"generationConfig": {"thinkingConfig": {"thinkingBudget": budget}}}

    return {}

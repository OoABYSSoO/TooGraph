from __future__ import annotations

from typing import Any, Callable

from app.core.model_catalog import get_default_text_model_ref, normalize_model_ref, resolve_runtime_model_name
from app.core.schemas.node_system import NodeSystemAgentNode
from app.core.thinking_levels import normalize_thinking_level, resolve_effective_thinking_level
from app.tools.local_llm import (
    get_default_agent_temperature,
    get_default_agent_thinking_enabled,
    get_default_agent_thinking_level,
)


def resolve_agent_runtime_config(
    node: NodeSystemAgentNode,
    *,
    get_default_text_model_ref_func: Callable[..., str] = get_default_text_model_ref,
    get_default_agent_thinking_enabled_func: Callable[[], bool] = get_default_agent_thinking_enabled,
    get_default_agent_thinking_level_func: Callable[[], str] = get_default_agent_thinking_level,
    get_default_agent_temperature_func: Callable[[], float] = get_default_agent_temperature,
    normalize_model_ref_func: Callable[[str], str] = normalize_model_ref,
    resolve_runtime_model_name_func: Callable[[str], str] = resolve_runtime_model_name,
    normalize_thinking_level_func: Callable[[Any], str] = normalize_thinking_level,
    resolve_effective_thinking_level_func: Callable[..., str] = resolve_effective_thinking_level,
) -> dict[str, Any]:
    global_model_ref = get_default_text_model_ref_func(force_refresh=True)
    global_thinking_enabled = get_default_agent_thinking_enabled_func()
    global_thinking_level = get_default_agent_thinking_level_func()
    default_temperature = get_default_agent_temperature_func()
    override_model_ref = normalize_model_ref_func(node.config.model) if node.config.model.strip() else ""

    resolved_model = (
        override_model_ref
        if node.config.model_source.value == "override" and override_model_ref
        else global_model_ref
    )
    resolved_temperature = max(0.0, min(float(node.config.temperature), 2.0))
    resolved_provider_id, _resolved_model_name = resolved_model.split("/", 1) if "/" in resolved_model else ("local", resolved_model)
    runtime_model_name = resolve_runtime_model_name_func(resolved_model)
    configured_thinking_level = normalize_thinking_level_func(node.config.thinking_mode.value)
    resolved_thinking_level = resolve_effective_thinking_level_func(
        configured_level=configured_thinking_level,
        provider_id=resolved_provider_id,
        model=runtime_model_name,
    )
    resolved_thinking = resolved_thinking_level != "off"

    return {
        "model_source": node.config.model_source.value,
        "configured_model_ref": override_model_ref,
        "thinking_mode": node.config.thinking_mode.value,
        "configured_thinking_level": configured_thinking_level,
        "configured_temperature": node.config.temperature,
        "global_model_ref": global_model_ref,
        "global_thinking_enabled": global_thinking_enabled,
        "global_thinking_level": global_thinking_level,
        "default_temperature": default_temperature,
        "resolved_model_ref": resolved_model,
        "resolved_provider_id": resolved_provider_id,
        "resolved_thinking": resolved_thinking,
        "resolved_thinking_level": resolved_thinking_level,
        "resolved_temperature": resolved_temperature,
        "runtime_model_name": runtime_model_name,
        "request_return_progress": resolved_thinking and resolved_provider_id == "local",
        "request_reasoning_format": "auto" if resolved_thinking and resolved_provider_id == "local" else None,
    }

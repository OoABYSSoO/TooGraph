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
    provider_profile = _resolved_provider_profile(node)
    provider_cost_budget = dict(provider_profile["cost_budget"])
    provider_rate_profile = dict(provider_profile["rate_profile"])

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
        "provider_profile": provider_profile,
        "provider_request_timeout_seconds": provider_profile["request_timeout_seconds"],
        "provider_cache_policy": provider_profile["cache_policy"],
        "provider_cost_budget": provider_cost_budget,
        "provider_rate_profile": provider_rate_profile,
    }


def _resolved_provider_profile(node: NodeSystemAgentNode) -> dict[str, Any]:
    profile = node.config.provider_profile
    return {
        "request_timeout_seconds": profile.request_timeout_seconds,
        "cache_policy": profile.cache_policy.value,
        "cost_budget": profile.cost_budget.model_dump(mode="json"),
        "rate_profile": _provider_rate_profile_payload(profile),
    }


def _provider_rate_profile_payload(profile: Any) -> dict[str, Any]:
    rate_profile = profile.rate_profile
    payload: dict[str, Any] = {}
    if rate_profile.requests_per_minute is not None:
        payload["requests_per_minute"] = rate_profile.requests_per_minute
    if rate_profile.tokens_per_minute is not None:
        payload["tokens_per_minute"] = rate_profile.tokens_per_minute
    if rate_profile.concurrency is not None:
        payload["concurrency"] = rate_profile.concurrency
    if rate_profile.wait_strategy != "block":
        payload["wait_strategy"] = rate_profile.wait_strategy
    if rate_profile.max_wait_seconds is not None:
        payload["max_wait_seconds"] = rate_profile.max_wait_seconds
    return payload

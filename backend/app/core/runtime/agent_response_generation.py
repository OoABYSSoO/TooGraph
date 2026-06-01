from __future__ import annotations

import shutil
from typing import Any, Callable

from app.core.model_catalog import get_default_video_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_multimodal import collect_input_attachments, prepare_model_input_attachments
from app.core.runtime.agent_prompt import (
    append_llm_prompt_snapshots,
    apply_provider_prompt_cache_result,
    build_auto_user_prompt,
    build_effective_system_prompt,
    build_llm_prompt_snapshot,
)
from app.core.runtime.model_call_context import use_model_call_context
from app.core.runtime.llm_output_parser import build_output_key_aliases, parse_llm_json_response
from app.core.runtime.structured_output import (
    STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST,
    build_agent_state_output_schema,
    build_json_repair_system_prompt,
    build_json_repair_user_prompt,
    validate_structured_output,
)
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
from app.core.thinking_levels import resolve_effective_thinking_level
from app.tools.local_llm import _chat_with_local_model_with_meta
from app.tools.model_provider_client import chat_with_model_ref_with_meta


def model_request_profile_kwargs(runtime_config: dict[str, Any]) -> dict[str, Any]:
    request_timeout_seconds = runtime_config.get("provider_request_timeout_seconds")
    return {"request_timeout_seconds": request_timeout_seconds} if request_timeout_seconds is not None else {}


def model_provider_request_profile_kwargs(
    runtime_config: dict[str, Any],
    prompt_snapshot: dict[str, Any],
) -> dict[str, Any]:
    kwargs = model_request_profile_kwargs(runtime_config)
    prompt_cache_policy = prompt_snapshot.get("prompt_cache_policy")
    if isinstance(prompt_cache_policy, dict) and prompt_cache_policy:
        kwargs["prompt_cache_policy"] = prompt_cache_policy
    provider_cost_budget = runtime_config.get("provider_cost_budget")
    if isinstance(provider_cost_budget, dict) and provider_cost_budget:
        kwargs["provider_cost_budget"] = provider_cost_budget
    provider_cost_budget_approval = runtime_config.get("provider_cost_budget_approval")
    if isinstance(provider_cost_budget_approval, dict) and provider_cost_budget_approval:
        kwargs["provider_cost_budget_approval"] = provider_cost_budget_approval
    provider_rate_profile = runtime_config.get("provider_rate_profile")
    if isinstance(provider_rate_profile, dict) and provider_rate_profile:
        kwargs["provider_rate_profile"] = provider_rate_profile
    return kwargs


def model_call_profile_context(
    runtime_config: dict[str, Any],
    prompt_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    context: dict[str, Any] = {}
    provider_profile = runtime_config.get("provider_profile")
    if isinstance(provider_profile, dict) and provider_profile:
        context["provider_profile"] = dict(provider_profile)
    request_timeout_seconds = runtime_config.get("provider_request_timeout_seconds")
    if request_timeout_seconds is not None:
        context["provider_request_timeout_seconds"] = request_timeout_seconds
    provider_cache_policy = str(runtime_config.get("provider_cache_policy") or "").strip()
    if provider_cache_policy:
        context["provider_cache_policy"] = provider_cache_policy
    provider_cost_budget = runtime_config.get("provider_cost_budget")
    if isinstance(provider_cost_budget, dict) and provider_cost_budget:
        context["provider_cost_budget"] = dict(provider_cost_budget)
    provider_cost_budget_approval = runtime_config.get("provider_cost_budget_approval")
    if isinstance(provider_cost_budget_approval, dict) and provider_cost_budget_approval:
        context["provider_cost_budget_approval"] = dict(provider_cost_budget_approval)
    provider_rate_profile = runtime_config.get("provider_rate_profile")
    if isinstance(provider_rate_profile, dict) and provider_rate_profile:
        context["provider_rate_profile"] = dict(provider_rate_profile)
    if isinstance(prompt_snapshot, dict):
        provider_cache_decision = prompt_snapshot.get("prompt_cache_policy")
        if isinstance(provider_cache_decision, dict) and provider_cache_decision:
            context["provider_cache_decision"] = dict(provider_cache_decision)
    return context


def generate_agent_response(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    action_context: dict[str, Any],
    runtime_config: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    on_delta: Any | None = None,
    build_effective_system_prompt_func: Callable[..., str] = build_effective_system_prompt,
    chat_with_local_model_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = _chat_with_local_model_with_meta,
    chat_with_model_ref_with_meta_func: Callable[..., tuple[str, dict[str, Any]]] = chat_with_model_ref_with_meta,
    parse_llm_json_response_func: Callable[..., dict[str, Any]] = parse_llm_json_response,
    build_output_key_aliases_func: Callable[..., dict[str, list[str]]] = build_output_key_aliases,
    get_default_video_model_ref_func: Callable[..., str] = get_default_video_model_ref,
    resolve_runtime_model_name_func: Callable[[str], str] = resolve_runtime_model_name,
    resolve_effective_thinking_level_func: Callable[..., str] = resolve_effective_thinking_level,
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    output_keys = [binding.state for binding in node.writes]
    if not output_keys:
        return {"summary": ""}, "", [], runtime_config

    raw_input_attachments = collect_input_attachments(input_values, state_schema=state_schema)
    input_attachments, attachment_warnings, attachment_meta = prepare_model_input_attachments(raw_input_attachments)
    runtime_config = _resolve_media_runtime_config(
        runtime_config,
        input_attachments,
        get_default_video_model_ref_func=get_default_video_model_ref_func,
        resolve_runtime_model_name_func=resolve_runtime_model_name_func,
        resolve_effective_thinking_level_func=resolve_effective_thinking_level_func,
    )
    system_prompt = build_effective_system_prompt_func(
        output_keys,
        input_values,
        action_context,
        task_instruction=node.config.task_instruction,
        state_schema=state_schema,
    )
    structured_output_schema = build_agent_state_output_schema(output_keys, state_schema or {})
    user_prompt = _build_agent_user_prompt(node, input_values, action_context, state_schema=state_schema)
    prompt_snapshot = build_llm_prompt_snapshot(
        phase="agent_response",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        input_values=input_values,
        output_keys=output_keys,
        structured_output_schema=structured_output_schema,
        provider_cache_policy=runtime_config.get("provider_cache_policy", "default"),
        runtime_context_location="user_prompt",
    )
    model_call_context = model_call_profile_context(runtime_config, prompt_snapshot)

    thinking_level = runtime_config.get("resolved_thinking_level")
    if not isinstance(thinking_level, str):
        thinking_level = "medium" if runtime_config.get("resolved_thinking") else "off"

    if runtime_config.get("resolved_provider_id") == "local":
        try:
            with use_model_call_context(phase="agent_response", **model_call_context):
                content, llm_meta = chat_with_local_model_with_meta_func(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    model=runtime_config["runtime_model_name"],
                    provider_id="local",
                    temperature=runtime_config["resolved_temperature"],
                    thinking_enabled=runtime_config["resolved_thinking"],
                    thinking_level=thinking_level,
                    on_delta=on_delta,
                    input_attachments=input_attachments,
                    structured_output_schema=structured_output_schema,
                    **model_request_profile_kwargs(runtime_config),
                )
        finally:
            _cleanup_prepared_media_paths(attachment_meta.get("cleanup_paths"))
    else:
        try:
            with use_model_call_context(phase="agent_response", **model_call_context):
                content, llm_meta = chat_with_model_ref_with_meta_func(
                    model_ref=runtime_config["resolved_model_ref"],
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=runtime_config["resolved_temperature"],
                    thinking_enabled=runtime_config["resolved_thinking"],
                    thinking_level=thinking_level,
                    on_delta=on_delta,
                    input_attachments=input_attachments,
                    structured_output_schema=structured_output_schema,
                    model_runtime_fixture=runtime_config.get("model_runtime_fixture"),
                    **model_provider_request_profile_kwargs(runtime_config, prompt_snapshot),
                )
        finally:
            _cleanup_prepared_media_paths(attachment_meta.get("cleanup_paths"))

    parsed_fields = parse_llm_json_response_func(
        content,
        output_keys,
        output_key_aliases=build_output_key_aliases_func(output_keys, state_schema or {}),
    )
    initial_structured_output_validation_errors = validate_structured_output(parsed_fields, structured_output_schema)
    structured_output_validation_errors = list(initial_structured_output_validation_errors)
    repair_attempted = False
    repair_succeeded = False
    repair_source: str | None = None
    repair_validation_errors: list[str] = []
    repair_error = ""
    repair_meta: dict[str, Any] = {}
    if initial_structured_output_validation_errors:
        repair_attempted = True
        repair_raw_model_output = content
        repair_source = "content"
        try:
            repair_content, repair_meta = repair_structured_output_with_runtime_model(
                runtime_config=runtime_config,
                structured_output_schema=structured_output_schema,
                validation_errors=initial_structured_output_validation_errors,
                raw_model_output=repair_raw_model_output,
                phase="structured_output_repair",
                output_keys=output_keys,
                structured_output_mode=STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST,
                chat_with_local_model_with_meta_func=chat_with_local_model_with_meta_func,
                chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta_func,
            )
            repair_parsed_fields = parse_llm_json_response_func(
                repair_content,
                output_keys,
                output_key_aliases=build_output_key_aliases_func(output_keys, state_schema or {}),
            )
            repair_validation_errors = validate_structured_output(repair_parsed_fields, structured_output_schema)
            if not repair_validation_errors:
                content = repair_content
                parsed_fields = repair_parsed_fields
                structured_output_validation_errors = []
                repair_succeeded = True
        except Exception as exc:
            repair_error = str(exc)
    response_payload: dict[str, Any] = {"summary": content, **parsed_fields}
    reasoning = str(llm_meta.get("reasoning") or "").strip()
    structured_output_strategy = str(llm_meta.get("structured_output_strategy") or "json_schema")
    prompt_snapshot = apply_provider_prompt_cache_result(prompt_snapshot, llm_meta.get("provider_prompt_cache_result"))
    large_video_fallbacks = attachment_meta.get("large_video_fallbacks", [])
    provider_video_fallback = llm_meta.get("video_fallback")
    if large_video_fallbacks:
        provider_video_fallback = {
            "used": True,
            "strategy": "preflight_large_video_frames",
            "large_video_fallbacks": large_video_fallbacks,
        }
    updated_runtime_config = {
        **runtime_config,
        "prompt_snapshots": append_llm_prompt_snapshots(runtime_config, prompt_snapshot, repair_meta.get("prompt_snapshot")),
        "provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "provider_reasoning_format": llm_meta.get("reasoning_format"),
        "provider_thinking_enabled": bool(llm_meta.get("thinking_enabled")),
        "provider_thinking_level": llm_meta.get("thinking_level", thinking_level),
        "provider_reasoning_captured": bool(reasoning),
        "provider_response_id": llm_meta.get("response_id"),
        "provider_usage": llm_meta.get("usage"),
        "provider_cost_estimate": llm_meta.get("provider_cost_estimate"),
        "provider_cost_budget_degradation": llm_meta.get("provider_cost_budget_degradation"),
        "provider_rate_decision": llm_meta.get("provider_rate_decision"),
        "provider_timings": llm_meta.get("timings"),
        "provider_fallback_used": bool(llm_meta.get("provider_fallback_used")),
        "requested_model_ref": llm_meta.get("requested_model_ref"),
        "provider_fallback_trace": llm_meta.get("provider_fallback_trace"),
        "provider_video_fallback": provider_video_fallback,
        "structured_output_strategy": structured_output_strategy,
        "structured_output_mode": llm_meta.get("structured_output_mode"),
        "structured_output_native_schema_fallback_used": bool(
            llm_meta.get("structured_output_native_schema_fallback_used")
        ),
        "structured_output_native_schema_conflict_provider": llm_meta.get(
            "structured_output_native_schema_conflict_provider"
        ),
        "structured_output_schema": structured_output_schema,
        "structured_output_validation_errors": structured_output_validation_errors,
        "structured_output_initial_validation_errors": initial_structured_output_validation_errors,
        "structured_output_repair_attempted": repair_attempted,
        "structured_output_repair_source": repair_source if repair_attempted else None,
        "structured_output_repair_succeeded": repair_succeeded,
        "structured_output_repair_validation_errors": repair_validation_errors,
        "structured_output_repair_error": repair_error,
        "structured_output_repair_provider_id": repair_meta.get("provider_id"),
        "structured_output_repair_provider_model": repair_meta.get("model"),
        "structured_output_repair_provider_response_id": repair_meta.get("response_id"),
        "structured_output_repair_provider_usage": repair_meta.get("usage"),
        "structured_output_repair_provider_cost_estimate": repair_meta.get("provider_cost_estimate"),
        "structured_output_repair_provider_cost_budget_degradation": repair_meta.get("provider_cost_budget_degradation"),
        "structured_output_repair_provider_rate_decision": repair_meta.get("provider_rate_decision"),
        "structured_output_repair_provider_timings": repair_meta.get("timings"),
        "structured_output_repair_provider_fallback_used": bool(repair_meta.get("provider_fallback_used")),
        "structured_output_repair_requested_model_ref": repair_meta.get("requested_model_ref"),
        "structured_output_repair_provider_fallback_trace": repair_meta.get("provider_fallback_trace"),
    }
    warnings = [*attachment_warnings, *llm_meta.get("warnings", []), *repair_meta.get("warnings", [])]
    if repair_error:
        warnings.append(f"Structured output repair failed: {repair_error}")
    if structured_output_validation_errors:
        warnings.append(
            "Structured output validation found mismatches: "
            + "; ".join(structured_output_validation_errors[:5])
        )
    return response_payload, reasoning, warnings, updated_runtime_config


def repair_structured_output_with_runtime_model(
    *,
    runtime_config: dict[str, Any],
    structured_output_schema: dict[str, Any],
    validation_errors: list[str],
    raw_model_output: str,
    chat_with_local_model_with_meta_func: Callable[..., tuple[str, dict[str, Any]]],
    chat_with_model_ref_with_meta_func: Callable[..., tuple[str, dict[str, Any]]],
    phase: str = "structured_output_repair",
    output_keys: list[str] | None = None,
    action_keys: list[str] | None = None,
    subgraph_keys: list[str] | None = None,
    structured_output_mode: str = STRUCTURED_OUTPUT_MODE_NATIVE_SCHEMA_FIRST,
) -> tuple[str, dict[str, Any]]:
    system_prompt = build_json_repair_system_prompt()
    user_prompt = build_json_repair_user_prompt(
        target_schema=structured_output_schema,
        validation_errors=validation_errors,
        raw_model_output=raw_model_output,
    )
    prompt_snapshot = build_llm_prompt_snapshot(
        phase=phase,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        output_keys=output_keys,
        action_keys=action_keys,
        subgraph_keys=subgraph_keys,
        structured_output_schema=structured_output_schema,
        provider_cache_policy=runtime_config.get("provider_cache_policy", "default"),
    )
    model_call_context = model_call_profile_context(runtime_config, prompt_snapshot)
    if runtime_config.get("resolved_provider_id") == "local":
        with use_model_call_context(phase="structured_output_repair", **model_call_context):
            content, meta = chat_with_local_model_with_meta_func(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                model=runtime_config["runtime_model_name"],
                provider_id="local",
                temperature=0.0,
                thinking_enabled=False,
                thinking_level="off",
                on_delta=None,
                input_attachments=[],
                structured_output_schema=structured_output_schema,
                structured_output_mode=structured_output_mode,
                **model_request_profile_kwargs(runtime_config),
            )
        return content, {**meta, "prompt_snapshot": prompt_snapshot}
    with use_model_call_context(phase="structured_output_repair", **model_call_context):
        content, meta = chat_with_model_ref_with_meta_func(
            model_ref=runtime_config["resolved_model_ref"],
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.0,
            thinking_enabled=False,
            thinking_level="off",
            on_delta=None,
            input_attachments=[],
            structured_output_schema=structured_output_schema,
            structured_output_mode=structured_output_mode,
            model_runtime_fixture=runtime_config.get("model_runtime_fixture"),
            **model_provider_request_profile_kwargs(runtime_config, prompt_snapshot),
        )
    prompt_snapshot = apply_provider_prompt_cache_result(prompt_snapshot, meta.get("provider_prompt_cache_result"))
    return content, {**meta, "prompt_snapshot": prompt_snapshot}


def _cleanup_prepared_media_paths(paths: Any) -> None:
    if not isinstance(paths, list):
        return
    for raw_path in paths:
        path = str(raw_path or "").strip()
        if not path:
            continue
        shutil.rmtree(path, ignore_errors=True)


def _build_agent_user_prompt(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    action_context: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
) -> str:
    return build_auto_user_prompt(
        node.config.task_instruction,
        input_values,
        action_context,
        state_schema=state_schema,
    )


def _resolve_media_runtime_config(
    runtime_config: dict[str, Any],
    input_attachments: list[dict[str, Any]],
    *,
    get_default_video_model_ref_func: Callable[..., str],
    resolve_runtime_model_name_func: Callable[[str], str],
    resolve_effective_thinking_level_func: Callable[..., str],
) -> dict[str, Any]:
    if not input_attachments or runtime_config.get("model_source") != "global":
        return runtime_config

    media_model_ref = get_default_video_model_ref_func(force_refresh=True)
    if not media_model_ref or media_model_ref == runtime_config.get("resolved_model_ref"):
        return runtime_config

    provider_id, _model_name = media_model_ref.split("/", 1) if "/" in media_model_ref else ("local", media_model_ref)
    runtime_model_name = resolve_runtime_model_name_func(media_model_ref)
    configured_thinking_level = str(
        runtime_config.get("configured_thinking_level")
        or runtime_config.get("resolved_thinking_level")
        or "off"
    )
    resolved_thinking_level = resolve_effective_thinking_level_func(
        configured_level=configured_thinking_level,
        provider_id=provider_id,
        model=runtime_model_name,
    )
    resolved_thinking = resolved_thinking_level != "off"
    return {
        **runtime_config,
        "media_model_ref": media_model_ref,
        "resolved_model_ref": media_model_ref,
        "resolved_provider_id": provider_id,
        "runtime_model_name": runtime_model_name,
        "resolved_thinking_level": resolved_thinking_level,
        "resolved_thinking": resolved_thinking,
        "request_return_progress": resolved_thinking and provider_id == "local",
        "request_reasoning_format": "auto" if resolved_thinking and provider_id == "local" else None,
    }

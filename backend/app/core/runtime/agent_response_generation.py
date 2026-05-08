from __future__ import annotations

import shutil
from typing import Any, Callable

from app.core.model_catalog import get_default_video_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_multimodal import collect_input_attachments, prepare_model_input_attachments
from app.core.runtime.agent_prompt import build_effective_system_prompt
from app.core.runtime.llm_output_parser import build_output_key_aliases, parse_llm_json_response
from app.core.runtime.structured_output import (
    build_agent_state_output_schema,
    build_json_repair_system_prompt,
    build_json_repair_user_prompt,
    validate_structured_output,
)
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
from app.core.thinking_levels import resolve_effective_thinking_level
from app.tools.local_llm import _chat_with_local_model_with_meta
from app.tools.model_provider_client import chat_with_model_ref_with_meta


def generate_agent_response(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
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
        skill_context,
        state_schema=state_schema,
    )
    structured_output_schema = build_agent_state_output_schema(output_keys, state_schema or {})
    user_prompt = _build_agent_user_prompt(node)

    thinking_level = runtime_config.get("resolved_thinking_level")
    if not isinstance(thinking_level, str):
        thinking_level = "medium" if runtime_config.get("resolved_thinking") else "off"

    if runtime_config.get("resolved_provider_id") == "local":
        try:
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
            )
        finally:
            _cleanup_prepared_media_paths(attachment_meta.get("cleanup_paths"))
    else:
        try:
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
    repair_validation_errors: list[str] = []
    repair_error = ""
    repair_meta: dict[str, Any] = {}
    if initial_structured_output_validation_errors:
        repair_attempted = True
        try:
            repair_content, repair_meta = repair_structured_output_with_runtime_model(
                runtime_config=runtime_config,
                structured_output_schema=structured_output_schema,
                validation_errors=initial_structured_output_validation_errors,
                raw_model_output=content,
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
        "provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "provider_reasoning_format": llm_meta.get("reasoning_format"),
        "provider_thinking_enabled": bool(llm_meta.get("thinking_enabled")),
        "provider_thinking_level": llm_meta.get("thinking_level", thinking_level),
        "provider_reasoning_captured": bool(reasoning),
        "provider_response_id": llm_meta.get("response_id"),
        "provider_usage": llm_meta.get("usage"),
        "provider_timings": llm_meta.get("timings"),
        "provider_video_fallback": provider_video_fallback,
        "structured_output_strategy": structured_output_strategy,
        "structured_output_schema": structured_output_schema,
        "structured_output_validation_errors": structured_output_validation_errors,
        "structured_output_initial_validation_errors": initial_structured_output_validation_errors,
        "structured_output_repair_attempted": repair_attempted,
        "structured_output_repair_succeeded": repair_succeeded,
        "structured_output_repair_validation_errors": repair_validation_errors,
        "structured_output_repair_error": repair_error,
        "structured_output_repair_provider_response_id": repair_meta.get("response_id"),
        "structured_output_repair_provider_usage": repair_meta.get("usage"),
        "structured_output_repair_provider_timings": repair_meta.get("timings"),
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
) -> tuple[str, dict[str, Any]]:
    system_prompt = build_json_repair_system_prompt()
    user_prompt = build_json_repair_user_prompt(
        target_schema=structured_output_schema,
        validation_errors=validation_errors,
        raw_model_output=raw_model_output,
    )
    if runtime_config.get("resolved_provider_id") == "local":
        return chat_with_local_model_with_meta_func(
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
        )
    return chat_with_model_ref_with_meta_func(
        model_ref=runtime_config["resolved_model_ref"],
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.0,
        thinking_enabled=False,
        thinking_level="off",
        on_delta=None,
        input_attachments=[],
        structured_output_schema=structured_output_schema,
    )


def _cleanup_prepared_media_paths(paths: Any) -> None:
    if not isinstance(paths, list):
        return
    for raw_path in paths:
        path = str(raw_path or "").strip()
        if not path:
            continue
        shutil.rmtree(path, ignore_errors=True)


def _build_agent_user_prompt(node: NodeSystemAgentNode) -> str:
    return (
        node.config.task_instruction
        if node.config.task_instruction
        else "根据输入和技能结果完成输出。"
    ).strip()


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

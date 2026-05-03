from __future__ import annotations

from typing import Any, Callable

from app.core.runtime.agent_multimodal import collect_input_attachments
from app.core.runtime.agent_prompt import build_effective_system_prompt
from app.core.runtime.llm_output_parser import build_output_key_aliases, parse_llm_json_response
from app.core.schemas.node_system import NodeSystemAgentNode, NodeSystemStateDefinition
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
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    output_keys = [binding.state for binding in node.writes]
    if not output_keys:
        return {"summary": ""}, "", [], runtime_config

    input_attachments = collect_input_attachments(input_values, state_schema=state_schema)
    system_prompt = build_effective_system_prompt_func(
        output_keys,
        input_values,
        skill_context,
        state_schema=state_schema,
    )
    user_prompt = (
        node.config.task_instruction
        if node.config.task_instruction
        else "根据输入和技能结果完成输出。"
    )

    thinking_level = runtime_config.get("resolved_thinking_level")
    if not isinstance(thinking_level, str):
        thinking_level = "medium" if runtime_config.get("resolved_thinking") else "off"

    if runtime_config.get("resolved_provider_id") == "local":
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
        )
    else:
        content, llm_meta = chat_with_model_ref_with_meta_func(
            model_ref=runtime_config["resolved_model_ref"],
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=runtime_config["resolved_temperature"],
            thinking_enabled=runtime_config["resolved_thinking"],
            thinking_level=thinking_level,
            on_delta=on_delta,
            input_attachments=input_attachments,
        )

    parsed_fields = parse_llm_json_response_func(
        content,
        output_keys,
        output_key_aliases=build_output_key_aliases_func(output_keys, state_schema or {}),
    )
    response_payload: dict[str, Any] = {"summary": content, **parsed_fields}
    reasoning = str(llm_meta.get("reasoning") or "").strip()
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
    }
    return response_payload, reasoning, llm_meta.get("warnings", []), updated_runtime_config

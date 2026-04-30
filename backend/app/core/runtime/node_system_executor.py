from __future__ import annotations

from typing import Any

from app.core.model_catalog import get_default_text_model_ref, normalize_model_ref, resolve_runtime_model_name
from app.core.runtime.agent_streaming import (
    build_agent_stream_delta_callback as _build_agent_stream_delta_callback,
    finalize_agent_stream_delta as _finalize_agent_stream_delta,
)
from app.core.runtime.agent_prompt import (
    build_auto_system_prompt as _build_auto_system_prompt,
    build_effective_system_prompt as _build_effective_system_prompt,
    format_state_output_contract_lines as _format_state_output_contract_lines,
    format_state_prompt_lines as _format_state_prompt_lines,
)
from app.core.runtime.agent_runtime_config import resolve_agent_runtime_config
from app.core.runtime.condition_eval import (
    coerce_condition_text as _coerce_condition_text,
    evaluate_condition_rule as _evaluate_condition_rule,
    normalize_condition_operands as _normalize_condition_operands,
    parse_condition_number as _parse_condition_number,
    resolve_branch_key as _resolve_branch_key,
)
from app.core.runtime.execution_graph import (
    CycleDetector,
    ExecutionEdge,
    build_conditional_edge_id as _build_conditional_edge_id,
    build_execution_edges as _build_execution_edges,
    build_regular_edge_id as _build_regular_edge_id,
    select_active_outgoing_edges as _select_active_outgoing_edges,
)
from app.core.runtime.input_boundary import (
    coerce_input_boundary_value as _coerce_input_boundary_value,
    first_truthy as _first_truthy,
)
from app.core.runtime.llm_output_parser import (
    build_output_key_aliases as _build_output_key_aliases,
    parse_llm_json_response as _parse_llm_json_response,
    read_parsed_output_value as _read_parsed_output_value,
)
from app.core.runtime.output_artifacts import (
    apply_loop_limit_exhausted_output_message as _apply_loop_limit_exhausted_output_message,
    format_loop_limit_exhausted_output_value as _format_loop_limit_exhausted_output_value,
    resolve_active_output_nodes as _resolve_active_output_nodes,
)
from app.core.runtime.output_boundaries import (
    collect_output_boundaries,
    execute_output_node as _execute_output_node,
)
from app.core.runtime.knowledge_retrieval import retrieve_knowledge_base_context
from app.core.runtime.reference_resolution import (
    read_path as _read_path,
    resolve_condition_source as _resolve_condition_source,
    resolve_reference as _resolve_reference,
)
from app.core.runtime.run_artifacts import (
    append_run_snapshot,
    build_knowledge_summary as _build_knowledge_summary,
    refresh_run_artifacts as _refresh_run_artifacts,
)
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state_io import (
    apply_state_writes as _apply_state_writes,
    collect_node_inputs as _collect_node_inputs,
    initialize_graph_state as _initialize_graph_state,
)
from app.core.runtime.skill_invocation import (
    callable_accepts_keyword as _callable_accepts_keyword,
    invoke_skill as _invoke_skill,
)
from app.core.runtime.state import touch_run_lifecycle
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemGraphDocument,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemStateDefinition,
    NodeSystemStateType,
)
from app.core.storage.run_store import save_run
from app.skills.registry import get_skill_registry
from app.tools.local_llm import (
    _chat_with_local_model_with_meta,
    get_default_agent_temperature,
    get_default_agent_thinking_enabled,
    get_default_agent_thinking_level,
)
from app.core.thinking_levels import normalize_thinking_level, resolve_effective_thinking_level
from app.tools.model_provider_client import chat_with_model_ref_with_meta

KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base"


def _persist_run_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
    touch_run_lifecycle(state)
    save_run(state)
    publish_run_event(
        str(state.get("run_id") or ""),
        "run.updated",
        {
            "status": state.get("status"),
            "current_node_id": state.get("current_node_id"),
            "duration_ms": state.get("duration_ms"),
            "updated_at": state.get("lifecycle", {}).get("updated_at") if isinstance(state.get("lifecycle"), dict) else None,
        },
    )


def _execute_node(
    graph: NodeSystemGraphDocument,
    node_name: str,
    node: Any,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    graph_context = {
        "metadata": state.get("metadata", {}),
        "state": state.get("state_values", {}),
    }

    if isinstance(node, NodeSystemInputNode):
        return _execute_input_node(graph.state_schema, node, state)
    if isinstance(node, NodeSystemAgentNode):
        return _execute_agent_node(graph.state_schema, node, input_values, graph_context, node_name=node_name, state=state)
    if isinstance(node, NodeSystemOutputNode):
        return _execute_output_node(node_name, node, input_values, state)
    if isinstance(node, NodeSystemConditionNode):
        return _execute_condition_node(node, input_values, graph_context)
    raise ValueError(f"Unsupported node kind '{node.kind}'.")


def _execute_input_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemInputNode,
    state: dict[str, Any],
) -> dict[str, Any]:
    outputs: dict[str, Any] = {}
    for binding in node.writes:
        definition = state_schema[binding.state]
        raw_value = definition.value
        value = _coerce_input_boundary_value(raw_value, definition.type)
        outputs[binding.state] = value

    final_result = _first_truthy(outputs.values())
    return {
        "outputs": outputs,
        "final_result": "" if final_result is None else str(final_result),
    }


def _execute_agent_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    node_name: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    selected_skills: list[str] = []
    skill_outputs: list[dict[str, Any]] = []
    skill_context: dict[str, Any] = {}
    registry = get_skill_registry(include_disabled=False)
    response_payload: dict[str, Any] = {}
    response_reasoning = ""
    warnings: list[str] = []
    runtime_config = _resolve_agent_runtime_config(node)

    knowledge_read = next(
        (
            binding.state
            for binding in node.reads
            if state_schema[binding.state].type == NodeSystemStateType.KNOWLEDGE_BASE
        ),
        None,
    )
    query_read = next(
        (
            binding.state
            for binding in node.reads
            if binding.state != knowledge_read and state_schema[binding.state].type in {NodeSystemStateType.TEXT, NodeSystemStateType.MARKDOWN}
        ),
        None,
    )

    for skill_key in node.config.skills:
        skill_func = registry.get(skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill_key}' is not registered.")

        if skill_key == KNOWLEDGE_BASE_SKILL_KEY:
            skill_inputs = {
                "knowledge_base": input_values.get(knowledge_read) if knowledge_read else None,
                "query": input_values.get(query_read) if query_read else None,
            }
            skill_result = retrieve_knowledge_base_context(
                knowledge_base=skill_inputs.get("knowledge_base"),
                query=skill_inputs.get("query"),
                limit=3,
            )
        else:
            skill_inputs = dict(input_values)
            skill_result = _invoke_skill(skill_func, skill_inputs)
        selected_skills.append(skill_key)
        skill_context[skill_key] = skill_result
        skill_outputs.append(
            {
                "skill_name": skill_key,
                "skill_key": skill_key,
                "inputs": skill_inputs,
                "outputs": skill_result,
            }
        )

    output_keys = [binding.state for binding in node.writes]
    stream_delta_callback = _build_agent_stream_delta_callback(
        state=state,
        node_name=node_name,
        output_keys=output_keys,
    )

    generate_kwargs: dict[str, Any] = {}
    if _callable_accepts_keyword(_generate_agent_response, "on_delta"):
        generate_kwargs["on_delta"] = stream_delta_callback
    if _callable_accepts_keyword(_generate_agent_response, "state_schema"):
        generate_kwargs["state_schema"] = state_schema
    response_payload, response_reasoning, response_warnings, runtime_config = _generate_agent_response(
        node,
        input_values,
        skill_context,
        runtime_config,
        **generate_kwargs,
    )
    warnings.extend(response_warnings)

    output_values = {
        state_name: response_payload.get(state_name)
        for state_name in output_keys
    }
    _finalize_agent_stream_delta(
        state=state,
        node_name=node_name,
        output_values=output_values,
    )

    return {
        "outputs": output_values,
        "response": response_payload,
        "reasoning": response_reasoning,
        "selected_skills": selected_skills,
        "skill_outputs": skill_outputs,
        "runtime_config": runtime_config,
        "warnings": list(dict.fromkeys(warnings)),
        "final_result": _first_truthy(output_values.values()) or response_payload.get("summary") or "",
    }


def _execute_condition_node(
    node: NodeSystemConditionNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
) -> dict[str, Any]:
    rule_value = _resolve_condition_source(
        node.config.rule.source,
        inputs=input_values,
        graph=graph_context,
        state_values=graph_context.get("state", {}),
    )
    condition_result = _evaluate_condition_rule(rule_value, node.config.rule.operator.value, node.config.rule.value)
    branch_key = _resolve_branch_key(node.config.branches, node.config.branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch.")

    return {
        "outputs": {branch_key: True},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


def _generate_agent_response(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    runtime_config: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    on_delta: Any | None = None,
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    output_keys = [binding.state for binding in node.writes]
    if not output_keys:
        return {"summary": ""}, "", [], runtime_config

    system_prompt = _build_effective_system_prompt(
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
        content, llm_meta = _chat_with_local_model_with_meta(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=runtime_config["runtime_model_name"],
            provider_id="local",
            temperature=runtime_config["resolved_temperature"],
            thinking_enabled=runtime_config["resolved_thinking"],
            thinking_level=thinking_level,
            on_delta=on_delta,
        )
    else:
        content, llm_meta = chat_with_model_ref_with_meta(
            model_ref=runtime_config["resolved_model_ref"],
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=runtime_config["resolved_temperature"],
            thinking_enabled=runtime_config["resolved_thinking"],
            thinking_level=thinking_level,
            on_delta=on_delta,
        )

    parsed_fields = _parse_llm_json_response(
        content,
        output_keys,
        output_key_aliases=_build_output_key_aliases(output_keys, state_schema or {}),
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


def _resolve_agent_runtime_config(node: NodeSystemAgentNode) -> dict[str, Any]:
    return resolve_agent_runtime_config(
        node,
        get_default_text_model_ref_func=get_default_text_model_ref,
        get_default_agent_thinking_enabled_func=get_default_agent_thinking_enabled,
        get_default_agent_thinking_level_func=get_default_agent_thinking_level,
        get_default_agent_temperature_func=get_default_agent_temperature,
        normalize_model_ref_func=normalize_model_ref,
        resolve_runtime_model_name_func=resolve_runtime_model_name,
        normalize_thinking_level_func=normalize_thinking_level,
        resolve_effective_thinking_level_func=resolve_effective_thinking_level,
    )


def _summarize_inputs(input_values: dict[str, Any]) -> str:
    if not input_values:
        return "no inputs"
    return str({key: str(value)[:80] for key, value in input_values.items()})[:160]


def _summarize_outputs(output_values: dict[str, Any], final_result: Any) -> str:
    if final_result:
        return str(final_result)[:160]
    if output_values:
        return str({key: str(value)[:80] for key, value in output_values.items()})[:160]
    return "no outputs"

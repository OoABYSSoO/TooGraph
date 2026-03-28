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
from app.core.runtime.agent_response_generation import generate_agent_response
from app.core.runtime.agent_skill_input_generation import generate_agent_skill_inputs
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
from app.core.runtime.node_handlers import (
    execute_agent_node as _execute_agent_node_impl,
    execute_condition_node as _execute_condition_node_impl,
    execute_input_node as _execute_input_node_impl,
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
from app.core.runtime.reference_resolution import (
    read_path as _read_path,
    resolve_condition_source as _resolve_condition_source,
    resolve_reference as _resolve_reference,
)
from app.core.runtime.run_artifacts import (
    append_run_snapshot,
    refresh_run_artifacts as _refresh_run_artifacts,
)
from app.core.runtime.run_progress import persist_run_progress
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.runtime_summaries import (
    summarize_inputs as _summarize_inputs,
    summarize_outputs as _summarize_outputs,
)
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

def _persist_run_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    persist_run_progress(
        state,
        node_outputs,
        active_edge_ids,
        started_perf=started_perf,
        refresh_run_artifacts_func=_refresh_run_artifacts,
        touch_run_lifecycle_func=touch_run_lifecycle,
        save_run_func=save_run,
        publish_run_event_func=publish_run_event,
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
    return _execute_input_node_impl(
        state_schema,
        node,
        state,
        coerce_input_boundary_value_func=_coerce_input_boundary_value,
        first_truthy_func=_first_truthy,
    )


def _execute_agent_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    node_name: str,
    state: dict[str, Any],
) -> dict[str, Any]:
    return _execute_agent_node_impl(
        state_schema,
        node,
        input_values,
        graph_context,
        node_name=node_name,
        state=state,
        get_skill_registry_func=get_skill_registry,
        invoke_skill_func=_invoke_skill,
        resolve_agent_runtime_config_func=_resolve_agent_runtime_config,
        build_agent_stream_delta_callback_func=_build_agent_stream_delta_callback,
        callable_accepts_keyword_func=_callable_accepts_keyword,
        generate_agent_skill_inputs_func=_generate_agent_skill_inputs,
        generate_agent_response_func=_generate_agent_response,
        finalize_agent_stream_delta_func=_finalize_agent_stream_delta,
        first_truthy_func=_first_truthy,
    )


def _execute_condition_node(
    node: NodeSystemConditionNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
) -> dict[str, Any]:
    return _execute_condition_node_impl(
        node,
        input_values,
        graph_context,
        resolve_condition_source_func=_resolve_condition_source,
        evaluate_condition_rule_func=_evaluate_condition_rule,
        resolve_branch_key_func=_resolve_branch_key,
    )


def _generate_agent_response(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    runtime_config: dict[str, Any],
    *,
    state_schema: dict[str, NodeSystemStateDefinition] | None = None,
    on_delta: Any | None = None,
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    return generate_agent_response(
        node,
        input_values,
        skill_context,
        runtime_config,
        state_schema=state_schema,
        on_delta=on_delta,
        build_effective_system_prompt_func=_build_effective_system_prompt,
        chat_with_local_model_with_meta_func=_chat_with_local_model_with_meta,
        chat_with_model_ref_with_meta_func=chat_with_model_ref_with_meta,
        parse_llm_json_response_func=_parse_llm_json_response,
        build_output_key_aliases_func=_build_output_key_aliases,
    )


def _generate_agent_skill_inputs(**kwargs: Any) -> tuple[dict[str, dict[str, Any]], str, list[str], dict[str, Any]]:
    return generate_agent_skill_inputs(**kwargs)


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

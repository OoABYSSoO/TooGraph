from __future__ import annotations

from time import perf_counter
from typing import Any, Callable

from app.core.runtime.agent_streaming import build_agent_stream_delta_callback, finalize_agent_stream_delta
from app.core.runtime.agent_runtime_config import resolve_agent_runtime_config
from app.core.runtime.agent_response_generation import generate_agent_response
from app.core.runtime.condition_eval import evaluate_condition_rule, resolve_branch_key
from app.core.runtime.input_boundary import coerce_input_boundary_value, first_truthy
from app.core.runtime.reference_resolution import resolve_condition_source
from app.core.runtime.skill_bindings import build_skill_inputs, map_skill_outputs, normalize_agent_skill_bindings
from app.core.runtime.skill_invocation import callable_accepts_keyword, invoke_skill
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemInputNode,
    NodeSystemStateDefinition,
    StateWriteMode,
)
from app.core.storage.skill_artifact_store import create_skill_artifact_context
from app.skills.registry import get_skill_registry


def execute_input_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemInputNode,
    state: dict[str, Any],
    *,
    coerce_input_boundary_value_func: Callable[..., Any] = coerce_input_boundary_value,
    first_truthy_func: Callable[..., Any] = first_truthy,
) -> dict[str, Any]:
    _ = state
    outputs: dict[str, Any] = {}
    for binding in node.writes:
        definition = state_schema[binding.state]
        raw_value = definition.value
        value = coerce_input_boundary_value_func(raw_value, definition.type)
        outputs[binding.state] = value

    final_result = first_truthy_func(outputs.values())
    return {
        "outputs": outputs,
        "final_result": "" if final_result is None else str(final_result),
    }


def execute_condition_node(
    node: NodeSystemConditionNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    resolve_condition_source_func: Callable[..., Any] = resolve_condition_source,
    evaluate_condition_rule_func: Callable[..., bool] = evaluate_condition_rule,
    resolve_branch_key_func: Callable[..., str | None] = resolve_branch_key,
) -> dict[str, Any]:
    rule_value = resolve_condition_source_func(
        node.config.rule.source,
        inputs=input_values,
        graph=graph_context,
        state_values=graph_context.get("state", {}),
    )
    condition_result = evaluate_condition_rule_func(rule_value, node.config.rule.operator.value, node.config.rule.value)
    branch_key = resolve_branch_key_func(node.config.branches, node.config.branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch.")

    return {
        "outputs": {branch_key: True},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


def execute_agent_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
    *,
    node_name: str,
    state: dict[str, Any],
    get_skill_registry_func: Callable[..., dict[str, Any]] = get_skill_registry,
    invoke_skill_func: Callable[..., dict[str, Any]] = invoke_skill,
    resolve_agent_runtime_config_func: Callable[..., dict[str, Any]] = resolve_agent_runtime_config,
    build_agent_stream_delta_callback_func: Callable[..., Any] = build_agent_stream_delta_callback,
    callable_accepts_keyword_func: Callable[..., bool] = callable_accepts_keyword,
    generate_agent_response_func: Callable[..., tuple[dict[str, Any], str, list[str], dict[str, Any]]] = generate_agent_response,
    finalize_agent_stream_delta_func: Callable[..., None] = finalize_agent_stream_delta,
    first_truthy_func: Callable[..., Any] = first_truthy,
) -> dict[str, Any]:
    selected_skills: list[str] = []
    skill_outputs: list[dict[str, Any]] = []
    skill_context: dict[str, Any] = {}
    registry = get_skill_registry_func(include_disabled=False)
    response_payload: dict[str, Any] = {}
    response_reasoning = ""
    warnings: list[str] = []
    runtime_config = resolve_agent_runtime_config_func(node)

    mapped_skill_outputs: dict[str, Any] = {}
    for binding in normalize_agent_skill_bindings(node, input_values=input_values, state_schema=state_schema):
        skill_key = binding.skill_key
        skill_func = registry.get(skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill_key}' is not registered.")

        started_at = perf_counter()
        skill_inputs = build_skill_inputs(binding, input_values)
        skill_invoke_kwargs: dict[str, Any] = {}
        if callable_accepts_keyword_func(invoke_skill_func, "context"):
            invocation_index = _next_skill_artifact_invocation_index(state, node_name, skill_key)
            skill_invoke_kwargs["context"] = create_skill_artifact_context(
                run_id=str(state.get("run_id") or "run"),
                node_id=node_name,
                skill_key=skill_key,
                invocation_index=invocation_index,
            )
        skill_result = invoke_skill_func(skill_func, skill_inputs, **skill_invoke_kwargs)
        duration_ms = int((perf_counter() - started_at) * 1000)
        state_writes = map_skill_outputs(binding, skill_result)
        skill_status, skill_error = _resolve_skill_invocation_status(skill_key, skill_result)
        if skill_status == "failed":
            warnings.append(f"Skill '{skill_key}' failed: {skill_error or 'Unknown error.'}")
        mapped_skill_outputs.update(state_writes)
        selected_skills.append(skill_key)
        skill_context[skill_key] = skill_result
        skill_outputs.append(
            {
                "skill_name": skill_key,
                "skill_key": skill_key,
                "trigger": binding.trigger,
                "inputs": skill_inputs,
                "outputs": skill_result,
                "output_mapping": dict(binding.output_mapping),
                "state_writes": state_writes,
                "duration_ms": duration_ms,
                "status": skill_status,
                "error": skill_error,
            }
        )

    output_keys = [binding.state for binding in node.writes]
    write_modes = {binding.state: binding.mode for binding in node.writes}
    if output_keys and all(state_name in mapped_skill_outputs for state_name in output_keys):
        output_values = dict(mapped_skill_outputs)
        finalize_kwargs: dict[str, Any] = {
            "state": state,
            "node_name": node_name,
            "output_values": output_values,
        }
        if callable_accepts_keyword_func(finalize_agent_stream_delta_func, "reasoning"):
            finalize_kwargs["reasoning"] = response_reasoning
        finalize_agent_stream_delta_func(**finalize_kwargs)
        return {
            "outputs": output_values,
            "response": response_payload,
            "reasoning": response_reasoning,
            "selected_skills": selected_skills,
            "skill_outputs": skill_outputs,
            "runtime_config": runtime_config,
            "warnings": list(dict.fromkeys(warnings)),
            "final_result": first_truthy_func(output_values.values()) or "",
        }

    stream_delta_kwargs: dict[str, Any] = {
        "state": state,
        "node_name": node_name,
        "output_keys": output_keys,
    }
    if callable_accepts_keyword_func(build_agent_stream_delta_callback_func, "stream_state_keys"):
        stream_delta_kwargs["stream_state_keys"] = output_keys
    stream_delta_callback = build_agent_stream_delta_callback_func(**stream_delta_kwargs)

    generate_kwargs: dict[str, Any] = {}
    if callable_accepts_keyword_func(generate_agent_response_func, "on_delta"):
        generate_kwargs["on_delta"] = stream_delta_callback
    if callable_accepts_keyword_func(generate_agent_response_func, "state_schema"):
        generate_kwargs["state_schema"] = state_schema
    response_payload, response_reasoning, response_warnings, runtime_config = generate_agent_response_func(
        node,
        input_values,
        skill_context,
        runtime_config,
        **generate_kwargs,
    )
    warnings.extend(response_warnings)

    output_values = dict(mapped_skill_outputs)
    for state_name in output_keys:
        if state_name in mapped_skill_outputs and write_modes.get(state_name) == StateWriteMode.APPEND:
            continue
        if state_name in response_payload:
            output_values[state_name] = response_payload.get(state_name)
        elif state_name not in output_values:
            output_values[state_name] = None
    finalize_kwargs: dict[str, Any] = {
        "state": state,
        "node_name": node_name,
        "output_values": output_values,
    }
    if callable_accepts_keyword_func(finalize_agent_stream_delta_func, "reasoning"):
        finalize_kwargs["reasoning"] = response_reasoning
    finalize_agent_stream_delta_func(**finalize_kwargs)

    return {
        "outputs": output_values,
        "response": response_payload,
        "reasoning": response_reasoning,
        "selected_skills": selected_skills,
        "skill_outputs": skill_outputs,
        "runtime_config": runtime_config,
        "warnings": list(dict.fromkeys(warnings)),
        "final_result": first_truthy_func(output_values.values()) or response_payload.get("summary") or "",
    }


def _next_skill_artifact_invocation_index(state: dict[str, Any], node_name: str, skill_key: str) -> int:
    raw_counters = state.get("skill_invocation_counts")
    if not isinstance(raw_counters, dict):
        raw_counters = {}
        state["skill_invocation_counts"] = raw_counters

    counter_key = f"{node_name}:{skill_key}"
    try:
        current_index = int(raw_counters.get(counter_key, 0))
    except (TypeError, ValueError):
        current_index = 0
    next_index = max(0, current_index) + 1
    raw_counters[counter_key] = next_index
    return next_index


def _resolve_skill_invocation_status(skill_key: str, skill_result: dict[str, Any]) -> tuple[str, str]:
    status = _compact_text(skill_result.get("status")).lower()
    error = _compact_text(skill_result.get("error"))
    if status in {"failed", "error"}:
        return "failed", error
    if status in {"succeeded", "success", "ok"}:
        return "succeeded", error
    if error:
        return "failed", error
    return "succeeded", ""


def _compact_text(value: Any) -> str:
    return str(value or "").strip()

from __future__ import annotations

import re
from time import perf_counter
from typing import Any, Callable

from app.core.runtime.agent_streaming import build_agent_stream_delta_callback, finalize_agent_stream_delta
from app.core.runtime.agent_runtime_config import resolve_agent_runtime_config
from app.core.runtime.agent_response_generation import generate_agent_response
from app.core.runtime.condition_eval import evaluate_condition_rule, resolve_branch_key
from app.core.runtime.input_boundary import coerce_input_boundary_value, first_truthy
from app.core.runtime.knowledge_retrieval import retrieve_knowledge_base_context
from app.core.runtime.reference_resolution import resolve_condition_source
from app.core.runtime.skill_bindings import build_skill_inputs, map_skill_outputs, normalize_agent_skill_bindings
from app.core.runtime.skill_invocation import callable_accepts_keyword, invoke_skill
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemInputNode,
    NodeSystemStateDefinition,
    NodeSystemStateType,
)
from app.skills.registry import get_skill_registry

KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base"
WEB_SEARCH_SKILL_KEY = "web_search"


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
    knowledge_base_skill_key: str = KNOWLEDGE_BASE_SKILL_KEY,
    get_skill_registry_func: Callable[..., dict[str, Any]] = get_skill_registry,
    retrieve_knowledge_base_context_func: Callable[..., dict[str, Any]] = retrieve_knowledge_base_context,
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

    mapped_skill_outputs: dict[str, Any] = {}
    for binding in normalize_agent_skill_bindings(node):
        skill_key = binding.skill_key
        skill_func = registry.get(skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill_key}' is not registered.")

        started_at = perf_counter()
        if skill_key == knowledge_base_skill_key and not binding.input_mapping:
            skill_inputs = {
                "knowledge_base": input_values.get(knowledge_read) if knowledge_read else None,
                "query": input_values.get(query_read) if query_read else None,
            }
            skill_result = retrieve_knowledge_base_context_func(
                knowledge_base=skill_inputs.get("knowledge_base"),
                query=skill_inputs.get("query"),
                limit=3,
            )
        else:
            skill_inputs = build_skill_inputs(binding, input_values)
            if skill_key == WEB_SEARCH_SKILL_KEY:
                skill_inputs = _with_default_web_search_query(skill_inputs, node)
            skill_result = invoke_skill_func(skill_func, skill_inputs)
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
    stream_delta_callback = build_agent_stream_delta_callback_func(
        state=state,
        node_name=node_name,
        output_keys=output_keys,
    )

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
    output_values.update(
        {
            state_name: response_payload.get(state_name)
            for state_name in output_keys
        }
    )
    finalize_agent_stream_delta_func(
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
        "final_result": first_truthy_func(output_values.values()) or response_payload.get("summary") or "",
    }


def _with_default_web_search_query(
    skill_inputs: dict[str, Any],
    node: NodeSystemAgentNode,
) -> dict[str, Any]:
    if _compact_text(skill_inputs.get("query")):
        return skill_inputs

    default_query = _build_web_search_query_from_instruction(node.config.task_instruction)
    if not default_query:
        for key in ("question", "input", "text", "prompt", "instruction"):
            default_query = _compact_text(skill_inputs.get(key))
            if default_query:
                break

    if not default_query:
        text_values = [
            _compact_text(value)
            for value in skill_inputs.values()
            if isinstance(value, str) and _compact_text(value)
        ]
        if len(text_values) == 1:
            default_query = text_values[0]

    if not default_query:
        return skill_inputs

    return {**skill_inputs, "query": default_query}


def _build_web_search_query_from_instruction(instruction: Any) -> str:
    query = _compact_text(instruction)
    if not query:
        return ""

    query = re.sub(r"^(请|帮我|帮忙|麻烦你)\s*", "", query)
    for prefix in ("联网搜索", "在线搜索", "网络搜索", "搜索一下", "搜索", "查询一下", "查询", "查一下", "查找"):
        if query.startswith(prefix):
            query = query[len(prefix) :].lstrip(" ，,。:：；;")
            break

    query = re.sub(
        r"^(并|然后|再)?\s*(请|帮我|帮忙)?\s*(告知|告诉我|告诉|回答|说明|输出|总结|分析)\s*",
        "",
        query,
    )
    return _compact_text(query)


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

from __future__ import annotations

import copy
import inspect
import json
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from app.core.model_catalog import get_default_text_model_ref, normalize_model_ref, resolve_runtime_model_name
from app.core.runtime.output_boundary_utils import save_output_value
from app.core.runtime.knowledge_retrieval import retrieve_knowledge_base_context
from app.core.runtime.state import touch_run_lifecycle, utc_now_iso
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
)

KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base"


@dataclass(frozen=True)
class ExecutionEdge:
    id: str
    source: str
    target: str
    kind: str
    state: str | None = None
    branch: str | None = None


class CycleDetector:
    def __init__(self, edges: list[ExecutionEdge]) -> None:
        self.edges = edges
        self.graph: dict[str, list[ExecutionEdge]] = defaultdict(list)
        for edge in edges:
            self.graph[edge.source].append(edge)

    def detect(self) -> tuple[bool, list[ExecutionEdge]]:
        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict[str, int] = defaultdict(lambda: WHITE)
        back_edges: list[ExecutionEdge] = []

        def dfs(node_name: str) -> None:
            color[node_name] = GRAY
            for edge in self.graph.get(node_name, []):
                neighbor = edge.target
                if color[neighbor] == GRAY:
                    back_edges.append(edge)
                elif color[neighbor] == WHITE:
                    dfs(neighbor)
            color[node_name] = BLACK

        ordered_nodes: list[str] = []
        seen_nodes: set[str] = set()
        for edge in self.edges:
            for node_name in (edge.source, edge.target):
                if node_name in seen_nodes:
                    continue
                seen_nodes.add(node_name)
                ordered_nodes.append(node_name)

        for node_name in ordered_nodes:
            if color[node_name] == WHITE:
                dfs(node_name)

        return len(back_edges) > 0, back_edges


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


def _refresh_run_artifacts(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    state["duration_ms"] = max(int((time.perf_counter() - started_perf) * 1000), 0)
    saved_outputs = list(state.get("saved_outputs", []))
    exported_outputs = [
        {
            "node_id": preview.get("node_id"),
            "label": preview.get("label"),
            "source_kind": preview.get("source_kind", "state"),
            "source_key": preview.get("source_key"),
            "display_mode": preview.get("display_mode"),
            "persist_enabled": preview.get("persist_enabled"),
            "persist_format": preview.get("persist_format"),
            "value": preview.get("value"),
            "saved_file": next(
                (
                    item
                    for item in saved_outputs
                    if item.get("node_id") == preview.get("node_id")
                    and item.get("source_key") == preview.get("source_key")
                ),
                None,
            ),
        }
        for preview in state.get("output_previews", [])
    ]
    state_values = dict(state.get("state_values", {}))
    state_events = list(state.get("state_events", []))
    state_last_writers = dict(state.get("state_last_writers", {}))
    state["artifacts"] = {
        "skill_outputs": state.get("skill_outputs", []),
        "output_previews": state.get("output_previews", []),
        "saved_outputs": saved_outputs,
        "exported_outputs": exported_outputs,
        "node_outputs": node_outputs,
        "active_edge_ids": sorted(active_edge_ids),
        "state_events": state_events,
        "state_values": state_values,
        "cycle_iterations": list(state.get("cycle_iterations", [])),
        "cycle_summary": dict(state.get("cycle_summary", {})),
    }
    state["state_snapshot"] = {
        "values": state_values,
        "last_writers": state_last_writers,
    }
    state["knowledge_summary"] = _build_knowledge_summary(state.get("skill_outputs", []))


def _initialize_graph_state(graph: NodeSystemGraphDocument, state: dict[str, Any]) -> None:
    initialized_values = {
        state_name: copy.deepcopy(definition.value)
        for state_name, definition in graph.state_schema.items()
    }
    initialized_values.update(dict(state.get("state_values", {})))
    state["state_values"] = initialized_values
    state["state_last_writers"] = dict(state.get("state_last_writers", {}))
    state["state_events"] = list(state.get("state_events", []))
    state["state_snapshot"] = {
        "values": dict(initialized_values),
        "last_writers": dict(state["state_last_writers"]),
    }


def append_run_snapshot(
    state: dict[str, Any],
    *,
    snapshot_id: str,
    kind: str,
    label: str,
) -> None:
    snapshots = state.setdefault("run_snapshots", [])
    snapshots.append(
        {
            "snapshot_id": snapshot_id,
            "kind": kind,
            "label": label,
            "created_at": utc_now_iso(),
            "status": state.get("status", ""),
            "current_node_id": state.get("current_node_id"),
            "checkpoint_metadata": copy.deepcopy(state.get("checkpoint_metadata", {})),
            "state_snapshot": copy.deepcopy(state.get("state_snapshot", {})),
            "graph_snapshot": copy.deepcopy(state.get("graph_snapshot", {})),
            "artifacts": copy.deepcopy(state.get("artifacts", {})),
            "node_status_map": copy.deepcopy(state.get("node_status_map", {})),
            "output_previews": copy.deepcopy(state.get("output_previews", [])),
            "final_result": str(state.get("final_result", "") or ""),
        }
    )


def _collect_node_inputs(node: Any, state: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resolved_inputs: dict[str, Any] = {}
    read_records: list[dict[str, Any]] = []
    for binding in node.reads:
        value = copy.deepcopy(state.get("state_values", {}).get(binding.state))
        resolved_inputs[binding.state] = value
        read_records.append(
            {
                "state_key": binding.state,
                "input_key": binding.state,
                "value": value,
            }
        )
    return resolved_inputs, read_records


def _apply_state_writes(
    node_name: str,
    write_bindings: list[Any],
    output_values: dict[str, Any],
    state: dict[str, Any],
) -> list[dict[str, Any]]:
    write_records: list[dict[str, Any]] = []
    state_values = state.setdefault("state_values", {})
    state_last_writers = state.setdefault("state_last_writers", {})
    state_events = state.setdefault("state_events", [])

    for binding in write_bindings:
        value = copy.deepcopy(output_values.get(binding.state))
        previous_value = copy.deepcopy(state_values.get(binding.state))
        changed = previous_value != value
        state_values[binding.state] = value
        writer_record = {
            "node_id": node_name,
            "output_key": binding.state,
            "mode": binding.mode.value,
            "updated_at": utc_now_iso(),
        }
        state_last_writers[binding.state] = writer_record
        state_events.append(
            {
                "node_id": node_name,
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "value": value,
                "created_at": utc_now_iso(),
            }
        )
        write_records.append(
            {
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "value": value,
                "changed": changed,
            }
        )
    return write_records


def _build_execution_edges(graph: NodeSystemGraphDocument) -> list[ExecutionEdge]:
    execution_edges: list[ExecutionEdge] = []
    for edge in graph.edges:
        execution_edges.append(
            ExecutionEdge(
                id=_build_regular_edge_id(edge.source, edge.target),
                source=edge.source,
                target=edge.target,
                kind="edge",
                state=None,
            )
        )

    for conditional_edge in graph.conditional_edges:
        for branch, target in conditional_edge.branches.items():
            execution_edges.append(
                ExecutionEdge(
                    id=_build_conditional_edge_id(conditional_edge.source, branch, target),
                    source=conditional_edge.source,
                    target=target,
                    kind="conditional",
                    branch=branch,
                )
            )
    return execution_edges


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
        return _execute_agent_node(graph.state_schema, node, input_values, graph_context)
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

    response_payload, response_reasoning, response_warnings, runtime_config = _generate_agent_response(
        node,
        input_values,
        skill_context,
        runtime_config,
    )
    warnings.extend(response_warnings)

    output_keys = [binding.state for binding in node.writes]
    output_values = {
        state_name: response_payload.get(state_name)
        for state_name in output_keys
    }

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


def _execute_output_node(
    node_name: str,
    node: NodeSystemOutputNode,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    binding = node.reads[0]
    value = input_values.get(binding.state)
    preview = {
        "node_id": node_name,
        "label": binding.state,
        "source_kind": "state",
        "source_key": binding.state,
        "display_mode": node.config.display_mode.value,
        "persist_enabled": node.config.persist_enabled,
        "persist_format": node.config.persist_format.value,
        "value": value,
    }
    saved_outputs: list[dict[str, Any]] = []
    if node.config.persist_enabled and value not in (None, "", [], {}):
        saved_outputs.append(
            save_output_value(
                run_id=str(state.get("run_id", "")),
                node_id=node_name,
                source_key=binding.state,
                value=value,
                persist_format=node.config.persist_format.value,
                file_name_template=node.config.file_name_template or binding.state,
            )
        )
    return {
        "outputs": {binding.state: value},
        "output_previews": [preview],
        "saved_outputs": saved_outputs,
        "final_result": "" if value is None else str(value),
    }


def _format_loop_limit_exhausted_output_value(value: Any) -> str:
    if isinstance(value, str):
        rendered = value
    elif value is None:
        rendered = ""
    elif isinstance(value, (dict, list, tuple, bool)):
        rendered = json.dumps(value, ensure_ascii=False)
    else:
        rendered = str(value)
    return f"循环已达上限，最新的结果是：{rendered}"


def _apply_loop_limit_exhausted_output_message(body: dict[str, Any]) -> dict[str, Any]:
    preview_items = list(body.get("output_previews", []))
    wrapped_final_result = _format_loop_limit_exhausted_output_value(
        preview_items[0].get("value") if preview_items else body.get("final_result")
    )
    wrapped_previews: list[dict[str, Any]] = []
    for preview in preview_items:
        wrapped_previews.append(
            {
                **preview,
                "display_mode": "text",
                "value": wrapped_final_result,
            }
        )
    return {
        **body,
        "output_previews": wrapped_previews,
        "final_result": wrapped_final_result,
    }


def collect_output_boundaries(
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
    active_edge_ids: set[str] | None = None,
) -> None:
    active_output_nodes = _resolve_active_output_nodes(graph, active_edge_ids or set())
    output_node_names = {
        node_name
        for node_name, node in graph.nodes.items()
        if isinstance(node, NodeSystemOutputNode)
    }
    refreshed_output_nodes = active_output_nodes or output_node_names
    state["output_previews"] = [
        preview
        for preview in state.get("output_previews", [])
        if preview.get("node_id") not in refreshed_output_nodes
    ]
    state["saved_outputs"] = [
        output
        for output in state.get("saved_outputs", [])
        if output.get("node_id") not in refreshed_output_nodes
    ]
    final_results: list[Any] = []

    for node_name, node in graph.nodes.items():
        if not isinstance(node, NodeSystemOutputNode) or not node.reads:
            continue
        if active_output_nodes and node_name not in active_output_nodes:
            continue

        binding = node.reads[0]
        body = _execute_output_node(
            node_name,
            node,
            {binding.state: copy.deepcopy(state.get("state_values", {}).get(binding.state))},
            state,
        )
        if state.get("loop_limit_exhaustion"):
            body = _apply_loop_limit_exhausted_output_message(body)
        state["output_previews"] = [*state.get("output_previews", []), *body.get("output_previews", [])]
        state["saved_outputs"] = [*state.get("saved_outputs", []), *body.get("saved_outputs", [])]
        state.setdefault("node_status_map", {})[node_name] = "success"
        if body.get("final_result") not in (None, "", [], {}):
            final_results.append(body["final_result"])

    if final_results:
        state["final_result"] = str(final_results[-1])


def _resolve_active_output_nodes(
    graph: NodeSystemGraphDocument,
    active_edge_ids: set[str],
) -> set[str]:
    if not active_edge_ids:
        return set()

    active_output_nodes: set[str] = set()
    for edge in graph.edges:
        target_node = graph.nodes.get(edge.target)
        if (
            isinstance(target_node, NodeSystemOutputNode)
            and _build_regular_edge_id(edge.source, edge.target) in active_edge_ids
        ):
            active_output_nodes.add(edge.target)

    for conditional_edge in graph.conditional_edges:
        for branch, target in conditional_edge.branches.items():
            target_node = graph.nodes.get(target)
            if (
                isinstance(target_node, NodeSystemOutputNode)
                and _build_conditional_edge_id(conditional_edge.source, branch, target) in active_edge_ids
            ):
                active_output_nodes.add(target)

    return active_output_nodes


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


def _resolve_condition_source(
    source: str,
    *,
    inputs: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if source.startswith("$"):
        return _resolve_reference(
            source,
            inputs=inputs,
            response={},
            skills={},
            context={},
            graph=graph,
            state_values=state_values,
        )
    if source in inputs:
        return inputs[source]
    if source in state_values:
        return state_values[source]
    return source


def _generate_agent_response(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    runtime_config: dict[str, Any],
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    output_keys = [binding.state for binding in node.writes]
    if not output_keys:
        return {"summary": ""}, "", [], runtime_config

    system_prompt = _build_effective_system_prompt(
        output_keys,
        input_values,
        skill_context,
    )
    user_prompt = (
        node.config.task_instruction
        if node.config.task_instruction
        else "根据输入和技能结果完成输出。"
    )

    content, llm_meta = _chat_with_local_model_with_meta(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=runtime_config["runtime_model_name"],
        provider_id=runtime_config["resolved_provider_id"],
        temperature=runtime_config["resolved_temperature"],
        thinking_enabled=runtime_config["resolved_thinking"],
    )

    parsed_fields = _parse_llm_json_response(content, output_keys)
    response_payload: dict[str, Any] = {"summary": content, **parsed_fields}
    reasoning = str(llm_meta.get("reasoning") or "").strip()
    updated_runtime_config = {
        **runtime_config,
        "provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "provider_reasoning_format": llm_meta.get("reasoning_format"),
        "provider_thinking_enabled": bool(llm_meta.get("thinking_enabled")),
        "provider_reasoning_captured": bool(reasoning),
        "provider_response_id": llm_meta.get("response_id"),
        "provider_usage": llm_meta.get("usage"),
        "provider_timings": llm_meta.get("timings"),
    }
    return response_payload, reasoning, llm_meta.get("warnings", []), updated_runtime_config


def _build_effective_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
) -> str:
    return _build_auto_system_prompt(output_keys, input_values, skill_context)


def _build_auto_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
) -> str:
    parts = [
        "你是一个工作流处理节点。根据输入和技能结果完成用户的任务指令。",
        "严格返回一个 JSON 对象，不要加 markdown 围栏或任何前缀。",
    ]

    if input_values:
        parts.append("\n== Graph State Inputs ==")
        for key, value in input_values.items():
            display = str(value)
            if len(display) > 200:
                display = display[:200] + "..."
            parts.append(f"- {key}: {display}")

    if skill_context:
        parts.append("\n== Skill Results ==")
        for skill_key, result in skill_context.items():
            parts.append(f"[{skill_key}]")
            if isinstance(result, dict):
                for result_key, result_value in result.items():
                    display = str(result_value)
                    if len(display) > 300:
                        display = display[:300] + "..."
                    parts.append(f"  {result_key}: {display}")
            else:
                parts.append(f"  {result}")

    example = json.dumps({key: "..." for key in output_keys}, ensure_ascii=False)
    parts.append("\n== 必须返回的 JSON 格式 ==")
    parts.append(example)
    parts.append("每个字段填入最合适的值。")
    return "\n".join(parts)


def _resolve_agent_runtime_config(node: NodeSystemAgentNode) -> dict[str, Any]:
    global_model_ref = get_default_text_model_ref(force_refresh=True)
    global_thinking_enabled = get_default_agent_thinking_enabled()
    default_temperature = get_default_agent_temperature()
    override_model_ref = normalize_model_ref(node.config.model) if node.config.model.strip() else ""

    resolved_model = (
        override_model_ref
        if node.config.model_source.value == "override" and override_model_ref
        else global_model_ref
    )
    resolved_thinking = node.config.thinking_mode.value == "on"
    resolved_temperature = max(0.0, min(float(node.config.temperature), 2.0))
    resolved_provider_id, _resolved_model_name = resolved_model.split("/", 1) if "/" in resolved_model else ("local", resolved_model)
    runtime_model_name = resolve_runtime_model_name(resolved_model)

    return {
        "model_source": node.config.model_source.value,
        "configured_model_ref": override_model_ref,
        "thinking_mode": node.config.thinking_mode.value,
        "configured_temperature": node.config.temperature,
        "global_model_ref": global_model_ref,
        "global_thinking_enabled": global_thinking_enabled,
        "default_temperature": default_temperature,
        "resolved_model_ref": resolved_model,
        "resolved_provider_id": resolved_provider_id,
        "resolved_thinking": resolved_thinking,
        "resolved_temperature": resolved_temperature,
        "runtime_model_name": runtime_model_name,
        "request_return_progress": resolved_thinking and resolved_provider_id == "local",
        "request_reasoning_format": "auto" if resolved_thinking and resolved_provider_id == "local" else None,
    }


def _invoke_skill(skill_func: Any, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    signature = inspect.signature(skill_func)
    parameters = list(signature.parameters.values())
    if len(parameters) >= 2:
        return skill_func({}, skill_inputs)
    return skill_func(**skill_inputs)


def _resolve_reference(
    reference: str,
    *,
    inputs: dict[str, Any],
    response: dict[str, Any],
    skills: dict[str, Any],
    context: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if not isinstance(reference, str) or not reference.startswith("$"):
        return reference
    if reference.startswith("$inputs."):
        return _read_path(inputs, reference[len("$inputs."):])
    if reference.startswith("$response."):
        return _read_path(response, reference[len("$response."):])
    if reference.startswith("$skills."):
        return _read_path(skills, reference[len("$skills."):])
    if reference.startswith("$context."):
        return _read_path(context, reference[len("$context."):])
    if reference.startswith("$state."):
        return _read_path(state_values, reference[len("$state."):])
    if reference.startswith("$graph."):
        return _read_path(graph, reference[len("$graph."):])
    return reference


def _evaluate_condition_rule(left_value: Any, operator: str, right_value: Any) -> bool:
    left_value, right_value = _normalize_condition_operands(left_value, right_value)
    if operator == "exists":
        return left_value not in (None, "", [], {})
    if operator == "==":
        return left_value == right_value
    if operator == "!=":
        return left_value != right_value
    if operator == ">":
        return left_value > right_value
    if operator == "<":
        return left_value < right_value
    if operator == ">=":
        return left_value >= right_value
    if operator == "<=":
        return left_value <= right_value
    if operator == "contains":
        return _coerce_condition_text(right_value) in _coerce_condition_text(left_value)
    if operator == "not_contains":
        return _coerce_condition_text(right_value) not in _coerce_condition_text(left_value)
    raise ValueError(f"Unsupported condition operator '{operator}'.")


def _normalize_condition_operands(left_value: Any, right_value: Any) -> tuple[Any, Any]:
    left_number = _parse_condition_number(left_value)
    right_number = _parse_condition_number(right_value)
    if left_number is not None and right_number is not None:
        return left_number, right_number
    return left_value, right_value


def _parse_condition_number(value: Any) -> int | float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if not isinstance(value, str):
        return None

    trimmed = value.strip()
    if not trimmed:
        return None
    if re.fullmatch(r"[+-]?\d+", trimmed):
        return int(trimmed)
    if re.fullmatch(r"[+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?", trimmed):
        return float(trimmed)
    return None


def _coerce_condition_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _resolve_branch_key(branches: list[str], branch_mapping: dict[str, str], condition_result: Any) -> str | None:
    lookup_keys = [
        str(condition_result).lower(),
        str(condition_result),
    ]
    for lookup_key in lookup_keys:
        if lookup_key in branch_mapping:
            return branch_mapping[lookup_key]

    if isinstance(condition_result, bool):
        bool_key = "true" if condition_result else "false"
        if bool_key in branches:
            return bool_key
        if len(branches) >= 2:
            return branches[0] if condition_result else branches[1]

    normalized_matches = {branch.lower(): branch for branch in branches}
    for lookup_key in lookup_keys:
        if lookup_key.lower() in normalized_matches:
            return normalized_matches[lookup_key.lower()]
    return None


def _select_active_outgoing_edges(outgoing_edges: list[ExecutionEdge], body: dict[str, Any]) -> set[str]:
    selected_branch = body.get("selected_branch")
    active_edges: set[str] = set()
    for edge in outgoing_edges:
        if edge.kind == "conditional":
            if selected_branch and edge.branch == selected_branch:
                active_edges.add(edge.id)
            continue
        active_edges.add(edge.id)
    return active_edges


def _parse_llm_json_response(content: str, output_keys: list[str]) -> dict[str, Any]:
    if not content:
        return {key: "" for key in output_keys}
    cleaned = re.sub(r"^\s*```(?:json)?\s*\n?", "", content)
    cleaned = re.sub(r"\n?\s*```\s*$", "", cleaned).strip()

    candidate_payloads = [cleaned]
    json_start = cleaned.find("{")
    json_end = cleaned.rfind("}")
    if json_start != -1 and json_end > json_start:
        candidate_payloads.append(cleaned[json_start : json_end + 1].strip())

    for candidate in candidate_payloads:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return {key: parsed.get(key) for key in output_keys}
        except json.JSONDecodeError:
            continue

    key_value_matches: dict[str, str] = {}
    for line in cleaned.splitlines():
        match = re.match(r'^\s*["\']?([A-Za-z0-9_\-]+)["\']?\s*[:：]\s*(.+?)\s*$', line)
        if not match:
            continue
        key, value = match.groups()
        if key in output_keys:
            key_value_matches[key] = value.strip().strip('"').strip("'")

    if key_value_matches:
        return {
            key: key_value_matches.get(key, "")
            for key in output_keys
        }

    if len(output_keys) == 1:
        key = output_keys[0]
        single_match = re.match(rf'^\s*{re.escape(key)}\s*[:：]\s*(.+?)\s*$', cleaned, flags=re.IGNORECASE | re.DOTALL)
        if single_match:
            return {key: single_match.group(1).strip()}

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return {key: parsed.get(key) for key in output_keys}
    except json.JSONDecodeError:
        pass
    return {key: cleaned for key in output_keys}


def _build_regular_edge_id(source: str, target: str) -> str:
    return f"edge:{source}:{target}"


def _build_conditional_edge_id(source: str, branch: str, target: str) -> str:
    return f"conditional:{source}:{branch}->{target}"
def _build_knowledge_summary(skill_outputs: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for skill_output in skill_outputs:
        if skill_output.get("skill_key") != KNOWLEDGE_BASE_SKILL_KEY:
            continue
        outputs = skill_output.get("outputs") or {}
        knowledge_base = outputs.get("knowledge_base") or "unknown"
        query = outputs.get("query") or ""
        citations = outputs.get("citations") or []
        header = f"Knowledge Base: {knowledge_base}"
        if query:
            header += f"\nQuery: {query}"
        lines.append(header)
        if citations:
            for citation in citations[:6]:
                lines.append(
                    f"- {citation.get('title') or 'Untitled'}"
                    f" | {citation.get('section') or 'Overview'}"
                    f" | {citation.get('url') or citation.get('source') or ''}"
                )
        else:
            lines.append("- No citations returned.")
    return "\n\n".join(lines).strip()


def _read_path(payload: Any, path: str) -> Any:
    current = payload
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


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


def _first_truthy(values: Any) -> Any:
    for value in values:
        if value:
            return value
    return None


def _coerce_input_boundary_value(value: Any, state_type: NodeSystemStateType) -> Any:
    if not isinstance(value, str):
        return value

    try:
        parsed = json.loads(value)
        if state_type in {NodeSystemStateType.NUMBER, NodeSystemStateType.BOOLEAN, NodeSystemStateType.OBJECT, NodeSystemStateType.ARRAY, NodeSystemStateType.JSON, NodeSystemStateType.FILE_LIST}:
            return parsed
        if state_type in {NodeSystemStateType.IMAGE, NodeSystemStateType.AUDIO, NodeSystemStateType.VIDEO, NodeSystemStateType.FILE} and isinstance(parsed, dict) and parsed.get("kind") == "uploaded_file":
            return parsed
        if state_type == NodeSystemStateType.KNOWLEDGE_BASE:
            return value
        return value
    except json.JSONDecodeError:
        return value

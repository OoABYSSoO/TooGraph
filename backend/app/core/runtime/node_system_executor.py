from __future__ import annotations

import heapq
import json
import re
import inspect
import time
from collections import defaultdict, deque
from typing import Any

from app.core.runtime.output_boundary_utils import save_output_value
from app.core.runtime.state import create_initial_run_state, utc_now_iso
from app.core.model_catalog import get_default_text_model_ref, normalize_model_ref, resolve_runtime_model_name
from app.core.schemas.node_system import (
    AgentNodeConfig,
    ConditionNodeConfig,
    InputBoundaryNodeConfig,
    NodeSystemGraphDocument,
    NodeSystemGraphEdge,
    NodeSystemGraphNode,
    OutputBoundaryNodeConfig,
)
from app.core.storage.run_store import save_run
from app.skills.registry import get_skill_registry
from app.tools.local_llm import (
    _chat_with_local_model_with_meta,
    get_default_agent_temperature,
    get_default_agent_thinking_enabled,
)


def execute_node_system_graph(
    graph: NodeSystemGraphDocument,
    initial_state: dict[str, Any] | None = None,
    *,
    persist_progress: bool = False,
) -> dict[str, Any]:
    started_perf = time.perf_counter()
    state = initial_state or create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    state["status"] = "running"
    state["started_at"] = utc_now_iso()
    state["theme_config"] = graph.theme_config.model_dump(mode="json")
    state["node_status_map"] = {node.id: "idle" for node in graph.nodes}

    nodes_by_id = {node.id: node for node in graph.nodes}
    incoming_edges, outgoing_edges = _index_edges(graph.edges)
    execution_order = _topological_order(graph.nodes, graph.edges)
    node_outputs: dict[str, dict[str, Any]] = {}
    active_edge_ids: set[str] = set()
    if persist_progress:
        _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)

    for node_id in execution_order:
        node = nodes_by_id[node_id]
        incoming_for_node = incoming_edges.get(node_id, [])
        is_root_node = len(incoming_for_node) == 0
        is_active_node = is_root_node or any(edge.id in active_edge_ids for edge in incoming_for_node)
        if not is_active_node:
            continue

        node_started_perf = time.perf_counter()
        state["current_node_id"] = node_id
        state["node_status_map"][node_id] = "running"
        if persist_progress:
            _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)

        try:
            input_values = _resolve_input_values(incoming_for_node, node_outputs, active_edge_ids)
            body = _execute_node(node, input_values, state)
            duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
            node_outputs[node_id] = body.get("outputs", {})
            active_edge_ids.update(_select_active_outgoing_edges(outgoing_edges.get(node_id, []), body))
            state["node_status_map"][node_id] = "success"
            if body.get("selected_skills"):
                state["selected_skills"] = [*state.get("selected_skills", []), *body["selected_skills"]]
            if body.get("skill_outputs"):
                state["skill_outputs"] = [*state.get("skill_outputs", []), *body["skill_outputs"]]
            if body.get("output_previews"):
                state["output_previews"] = [*state.get("output_previews", []), *body["output_previews"]]
            if body.get("saved_outputs"):
                state["saved_outputs"] = [*state.get("saved_outputs", []), *body["saved_outputs"]]
            if body.get("final_result"):
                state["final_result"] = str(body["final_result"])
            state["node_executions"] = [
                *state.get("node_executions", []),
                {
                    "node_id": node.id,
                    "node_type": node.data.config.family,
                    "status": "success",
                    "started_at": utc_now_iso(),
                    "finished_at": utc_now_iso(),
                    "duration_ms": duration_ms,
                    "input_summary": _summarize_inputs(input_values),
                    "output_summary": _summarize_outputs(body.get("outputs", {}), body.get("final_result")),
                    "artifacts": {
                        "inputs": input_values,
                        "outputs": body.get("outputs", {}),
                        "family": node.data.config.family,
                        "selected_branch": body.get("selected_branch"),
                        "response": body.get("response"),
                        "reasoning": body.get("reasoning"),
                        "runtime_config": body.get("runtime_config"),
                    },
                    "warnings": body.get("warnings", []),
                    "errors": [],
                },
            ]
            if persist_progress:
                _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)
        except Exception as exc:  # pragma: no cover - defensive runtime path
            duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
            state["node_status_map"][node_id] = "failed"
            state["status"] = "failed"
            state["errors"] = [*state.get("errors", []), str(exc)]
            state["node_executions"] = [
                *state.get("node_executions", []),
                {
                    "node_id": node.id,
                    "node_type": node.data.config.family,
                    "status": "failed",
                    "started_at": utc_now_iso(),
                    "finished_at": utc_now_iso(),
                    "duration_ms": duration_ms,
                    "input_summary": "",
                    "output_summary": "",
                    "artifacts": {"family": node.data.config.family},
                    "warnings": [],
                    "errors": [str(exc)],
                },
            ]
            if persist_progress:
                _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)
            break

    if state.get("status") != "failed":
        state["status"] = "completed"
        state["current_node_id"] = None
    state["completed_at"] = utc_now_iso()
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
    save_run(state)
    return state


def _persist_run_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
    save_run(state)


def _refresh_run_artifacts(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    state["duration_ms"] = max(int((time.perf_counter() - started_perf) * 1000), 0)
    exported_outputs = [
        {
            "node_id": preview.get("node_id"),
            "state_key": preview.get("state_key"),
            "label": preview.get("label"),
            "display_mode": preview.get("display_mode"),
            "persist_enabled": preview.get("persist_enabled"),
            "persist_format": preview.get("persist_format"),
            "value": preview.get("value"),
            "saved_file": next(
                (
                    item
                    for item in state.get("saved_outputs", [])
                    if item.get("state_key") == preview.get("state_key")
                ),
                None,
            ),
        }
        for preview in state.get("output_previews", [])
    ]
    state["artifacts"] = {
        "theme_config": state.get("theme_config", {}),
        "skill_outputs": state.get("skill_outputs", []),
        "output_previews": state.get("output_previews", []),
        "saved_outputs": state.get("saved_outputs", []),
        "exported_outputs": exported_outputs,
        "node_outputs": node_outputs,
        "active_edge_ids": sorted(active_edge_ids),
    }
    state["state_snapshot"] = {
        "node_outputs": node_outputs,
        "selected_skills": state.get("selected_skills", []),
        "skill_outputs": state.get("skill_outputs", []),
        "output_previews": state.get("output_previews", []),
        "saved_outputs": state.get("saved_outputs", []),
        "exported_outputs": exported_outputs,
        "final_result": state.get("final_result", ""),
        "active_edge_ids": sorted(active_edge_ids),
    }


def _index_edges(edges: list[NodeSystemGraphEdge]) -> tuple[dict[str, list[NodeSystemGraphEdge]], dict[str, list[NodeSystemGraphEdge]]]:
    incoming_edges: dict[str, list[NodeSystemGraphEdge]] = defaultdict(list)
    outgoing_edges: dict[str, list[NodeSystemGraphEdge]] = defaultdict(list)
    for edge in edges:
        incoming_edges[edge.target].append(edge)
        outgoing_edges[edge.source].append(edge)
    return incoming_edges, outgoing_edges


def _topological_order(nodes: list[NodeSystemGraphNode], edges: list[NodeSystemGraphEdge]) -> list[str]:
    node_priority = _build_output_priority(nodes, edges)
    node_order_lookup = {node.id: index for index, node in enumerate(nodes)}
    indegree = {node.id: 0 for node in nodes}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.source].append(edge.target)
        indegree[edge.target] = indegree.get(edge.target, 0) + 1

    queue: list[tuple[int, int, str]] = []
    for node_id, degree in indegree.items():
        if degree != 0:
            continue
        heapq.heappush(queue, (node_priority[node_id], node_order_lookup[node_id], node_id))
    order: list[str] = []
    while queue:
        _, _, node_id = heapq.heappop(queue)
        order.append(node_id)
        for target in adjacency.get(node_id, []):
            indegree[target] -= 1
            if indegree[target] == 0:
                heapq.heappush(queue, (node_priority[target], node_order_lookup[target], target))

    if len(order) != len(nodes):
        raise ValueError("Node system graph currently requires an acyclic topology.")
    return order


def _build_output_priority(nodes: list[NodeSystemGraphNode], edges: list[NodeSystemGraphEdge]) -> dict[str, int]:
    reverse_adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        reverse_adjacency[edge.target].append(edge.source)

    distances: dict[str, int] = {}
    queue = deque(
        node.id
        for node in nodes
        if isinstance(node.data.config, OutputBoundaryNodeConfig)
    )

    for node_id in queue:
        distances[node_id] = 0

    while queue:
        node_id = queue.popleft()
        distance = distances[node_id]
        for parent_id in reverse_adjacency.get(node_id, []):
            next_distance = distance + 1
            current_distance = distances.get(parent_id)
            if current_distance is not None and current_distance <= next_distance:
                continue
            distances[parent_id] = next_distance
            queue.append(parent_id)

    fallback_priority = len(nodes) + len(edges) + 1
    return {
        node.id: distances.get(node.id, fallback_priority)
        for node in nodes
    }


def _resolve_input_values(
    incoming_edges: list[NodeSystemGraphEdge],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
) -> dict[str, Any]:
    input_values: dict[str, Any] = {}
    for edge in incoming_edges:
        if edge.id not in active_edge_ids:
            continue
        source_outputs = node_outputs.get(edge.source, {})
        if not edge.source_handle or not edge.target_handle:
            continue
        source_key = edge.source_handle.split(":", 1)[-1]
        target_key = edge.target_handle.split(":", 1)[-1]
        input_values[target_key] = source_outputs.get(source_key)
    return input_values


def _execute_node(node: NodeSystemGraphNode, input_values: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    config = node.data.config
    graph_context = {
        "theme_config": state.get("theme_config", {}),
        "metadata": state.get("metadata", {}),
    }
    if isinstance(config, InputBoundaryNodeConfig):
        raw_value = input_values.get(config.output.key, config.default_value)
        value = _coerce_input_boundary_value(raw_value, config.value_type.value)
        return {
            "outputs": {config.output.key: value},
            "final_result": str(value) if value is not None else "",
        }
    if isinstance(config, AgentNodeConfig):
        return _execute_agent_node(node, config, input_values, graph_context)
    if isinstance(config, OutputBoundaryNodeConfig):
        value = input_values.get(config.input.key)
        preview = {
            "node_id": node.id,
            "state_key": config.input.key,
            "label": config.label,
            "display_mode": config.display_mode.value,
            "persist_enabled": config.persist_enabled,
            "persist_format": config.persist_format.value,
            "value": value,
        }
        saved_outputs: list[dict[str, Any]] = []
        if config.persist_enabled and value not in (None, "", [], {}):
            saved_outputs.append(
                save_output_value(
                    run_id=str(state.get("run_id", "")),
                    state_key=config.input.key,
                    value=value,
                    persist_format=config.persist_format.value,
                    file_name_template=config.file_name_template or config.label or config.input.key,
                )
            )
        return {
            "outputs": {config.input.key: value},
            "output_previews": [preview],
            "saved_outputs": saved_outputs,
            "final_result": "" if value is None else str(value),
        }
    if isinstance(config, ConditionNodeConfig):
        return _execute_condition_node(config, input_values, graph_context)
    raise ValueError(f"Unsupported node family '{config.family}'.")


def _execute_agent_node(
    node: NodeSystemGraphNode,
    config: AgentNodeConfig,
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
    runtime_config = _resolve_agent_runtime_config(config)

    requires_response_before_skills = any(
        _skill_uses_response(skill.input_mapping) or _skill_uses_response(skill.context_binding)
        for skill in config.skills
    )
    if requires_response_before_skills:
        response_payload, response_reasoning, response_warnings, runtime_config = _generate_agent_response(
            config,
            input_values,
            skill_context,
            runtime_config,
        )
        warnings.extend(response_warnings)

    for skill in config.skills:
        skill_func = registry.get(skill.skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill.skill_key}' is not registered.")
        if skill.input_mapping:
            skill_inputs = {
                target_key: _resolve_reference(
                    source_ref,
                    inputs=input_values,
                    response=response_payload,
                    skills=skill_context,
                    context=skill_context,
                    graph=graph_context,
                )
                for target_key, source_ref in skill.input_mapping.items()
            }
        else:
            skill_inputs = dict(input_values)
        skill_result = _invoke_skill(skill_func, skill_inputs)
        selected_skills.append(skill.skill_key)
        skill_context[skill.name] = skill_result
        for context_key, source_ref in skill.context_binding.items():
            skill_context[context_key] = _resolve_reference(
                source_ref,
                inputs=input_values,
                response=response_payload,
                skills=skill_context,
                context=skill_context,
                graph=graph_context,
            )
        skill_outputs.append(
            {
                "skill_name": skill.name,
                "skill_key": skill.skill_key,
                "inputs": skill_inputs,
                "outputs": skill_result,
            }
        )

    bound_output_values = {
        output.key: _resolve_reference(
            config.output_binding.get(output.key, f"$response.{output.key}"),
            inputs=input_values,
            response=response_payload,
            skills=skill_context,
            context=skill_context,
            graph=graph_context,
        )
        for output in config.outputs
    }

    if any(value in (None, "") for value in bound_output_values.values()):
        response_payload, response_reasoning, response_warnings, runtime_config = _generate_agent_response(
            config,
            input_values,
            skill_context,
            runtime_config,
        )
        warnings.extend(response_warnings)

    output_values = {
        output.key: _resolve_reference(
            config.output_binding.get(output.key, f"$response.{output.key}"),
            inputs=input_values,
            response=response_payload,
            skills=skill_context,
            context=skill_context,
            graph=graph_context,
        )
        for output in config.outputs
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


def _skill_uses_response(mapping: dict[str, str]) -> bool:
    return any(isinstance(source_ref, str) and source_ref.startswith("$response.") for source_ref in mapping.values())


def _parse_llm_json_response(content: str, output_keys: list[str]) -> dict[str, Any]:
    """清理 LLM 返回的 markdown 代码块标记，尝试解析 JSON，按 output_keys 提取字段值。
    解析失败时，将原始字符串作为每个 key 的 fallback 值。"""
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


def _build_auto_system_prompt(
    config: AgentNodeConfig,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
) -> str:
    output_keys = [output.key for output in config.outputs]
    parts = [
        "你是一个工作流处理节点。根据输入和技能结果完成用户的任务指令。",
        "严格返回一个 JSON 对象，不要加 markdown 围栏或任何前缀。",
    ]

    if input_values:
        parts.append("\n== 输入 ==")
        for key, value in input_values.items():
            display = str(value)
            if len(display) > 200:
                display = display[:200] + "..."
            parts.append(f"- {key}: {display}")

    if skill_context:
        parts.append("\n== 技能执行结果 ==")
        for name, result in skill_context.items():
            parts.append(f"[{name}]")
            if isinstance(result, dict):
                for k, v in result.items():
                    display = str(v)
                    if len(display) > 300:
                        display = display[:300] + "..."
                    parts.append(f"  {k}: {display}")
            else:
                parts.append(f"  {result}")

    if output_keys:
        example = json.dumps({k: "..." for k in output_keys}, ensure_ascii=False)
        parts.append(f"\n== 必须返回的 JSON 格式 ==")
        parts.append(example)
        parts.append("每个字段填入最合适的值。")

    return "\n".join(parts)


def _generate_agent_response(
    config: AgentNodeConfig,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    runtime_config: dict[str, Any],
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    output_keys = [output.key for output in config.outputs]
    if not output_keys:
        return {"summary": ""}, "", [], runtime_config

    system_prompt = (
        config.system_instruction
        if config.system_instruction
        else _build_auto_system_prompt(config, input_values, skill_context)
    )

    user_prompt = (
        config.task_instruction
        if config.task_instruction
        else "根据输入和技能结果，完成输出。"
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


def _resolve_agent_runtime_config(config: AgentNodeConfig) -> dict[str, Any]:
    global_model_ref = get_default_text_model_ref()
    global_thinking_enabled = get_default_agent_thinking_enabled()
    default_temperature = get_default_agent_temperature()
    override_model_ref = normalize_model_ref(config.model) if config.model.strip() else ""

    resolved_model = (
        override_model_ref
        if config.model_source.value == "override" and override_model_ref
        else global_model_ref
    )
    resolved_thinking = (
        global_thinking_enabled
        if config.thinking_mode.value == "inherit"
        else config.thinking_mode.value == "on"
    )
    resolved_temperature = max(0.0, min(float(config.temperature), 2.0))
    resolved_provider_id, _resolved_model_name = resolved_model.split("/", 1) if "/" in resolved_model else ("local", resolved_model)
    runtime_model_name = resolve_runtime_model_name(resolved_model)

    return {
        "model_source": config.model_source.value,
        "configured_model_ref": override_model_ref,
        "thinking_mode": config.thinking_mode.value,
        "configured_temperature": config.temperature,
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


def _execute_condition_node(
    config: ConditionNodeConfig,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
) -> dict[str, Any]:
    if config.condition_mode.value != "rule":
        raise ValueError("Condition node currently only supports rule mode.")

    rule_value = _resolve_reference(
        config.rule.source,
        inputs=input_values,
        response={},
        skills={},
        context={},
        graph=graph_context,
    )
    condition_result = _evaluate_condition_rule(rule_value, config.rule.operator.value, config.rule.value)
    branch_key = _resolve_branch_key(config.branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch from branchMapping.")

    return {
        "outputs": {branch.key: branch.key == branch_key for branch in config.branches},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


def _resolve_reference(
    reference: str,
    *,
    inputs: dict[str, Any],
    response: dict[str, Any],
    skills: dict[str, Any],
    context: dict[str, Any],
    graph: dict[str, Any],
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
    if reference.startswith("$graph."):
        return _read_path(graph, reference[len("$graph."):])
    return reference


def _evaluate_condition_rule(left_value: Any, operator: str, right_value: Any) -> bool:
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
    raise ValueError(f"Unsupported condition operator '{operator}'.")


def _resolve_branch_key(branch_mapping: dict[str, str], condition_result: Any) -> str | None:
    lookup_keys = [
        str(condition_result).lower(),
        str(condition_result),
    ]
    for lookup_key in lookup_keys:
        if lookup_key in branch_mapping:
            return branch_mapping[lookup_key]
    return None


def _select_active_outgoing_edges(outgoing_edges: list[NodeSystemGraphEdge], body: dict[str, Any]) -> set[str]:
    selected_branch = body.get("selected_branch")
    if not selected_branch:
        return {edge.id for edge in outgoing_edges}

    active_edges: set[str] = set()
    for edge in outgoing_edges:
        if not edge.source_handle:
            continue
        source_key = edge.source_handle.split(":", 1)[-1]
        if source_key == selected_branch:
            active_edges.add(edge.id)
    return active_edges


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


def _coerce_input_boundary_value(value: Any, value_type: str) -> Any:
    if not isinstance(value, str):
        return value

    try:
        parsed = json.loads(value)
        if value_type == "json":
            return parsed
        if value_type in {"image", "audio", "video", "file"} and isinstance(parsed, dict) and parsed.get("kind") == "uploaded_file":
            return parsed
        if value_type == "knowledge_base":
            return value
        return value
    except json.JSONDecodeError:
        return value

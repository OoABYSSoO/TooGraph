from __future__ import annotations

import json
import inspect
import time
from collections import defaultdict, deque
from typing import Any

from app.core.runtime.output_boundary_utils import save_output_value
from app.core.runtime.state import create_initial_run_state, utc_now_iso
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
from app.tools.local_llm import _chat_with_local_model


def execute_node_system_graph(graph: NodeSystemGraphDocument) -> dict[str, Any]:
    started_at = utc_now_iso()
    started_perf = time.perf_counter()
    state = create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    state["status"] = "running"
    state["started_at"] = started_at
    state["theme_config"] = graph.theme_config.model_dump(mode="json")
    state["node_status_map"] = {node.id: "idle" for node in graph.nodes}

    nodes_by_id = {node.id: node for node in graph.nodes}
    incoming_edges, outgoing_edges = _index_edges(graph.edges)
    execution_order = _topological_order(graph.nodes, graph.edges)
    node_outputs: dict[str, dict[str, Any]] = {}
    active_edge_ids: set[str] = set()

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
                    },
                    "warnings": body.get("warnings", []),
                    "errors": [],
                },
            ]
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
            break

    if state.get("status") != "failed":
        state["status"] = "completed"
    state["completed_at"] = utc_now_iso()
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
    save_run(state)
    return state


def _index_edges(edges: list[NodeSystemGraphEdge]) -> tuple[dict[str, list[NodeSystemGraphEdge]], dict[str, list[NodeSystemGraphEdge]]]:
    incoming_edges: dict[str, list[NodeSystemGraphEdge]] = defaultdict(list)
    outgoing_edges: dict[str, list[NodeSystemGraphEdge]] = defaultdict(list)
    for edge in edges:
        incoming_edges[edge.target].append(edge)
        outgoing_edges[edge.source].append(edge)
    return incoming_edges, outgoing_edges


def _topological_order(nodes: list[NodeSystemGraphNode], edges: list[NodeSystemGraphEdge]) -> list[str]:
    indegree = {node.id: 0 for node in nodes}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.source].append(edge.target)
        indegree[edge.target] = indegree.get(edge.target, 0) + 1

    queue = deque(sorted(node_id for node_id, degree in indegree.items() if degree == 0))
    order: list[str] = []
    while queue:
        node_id = queue.popleft()
        order.append(node_id)
        for target in adjacency.get(node_id, []):
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)

    if len(order) != len(nodes):
        raise ValueError("Node system graph currently requires an acyclic topology.")
    return order


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
    if isinstance(config, InputBoundaryNodeConfig):
        raw_value = input_values.get(config.output.key, config.default_value)
        value = _coerce_input_boundary_value(raw_value, config.value_type.value)
        return {
            "outputs": {config.output.key: value},
            "final_result": str(value) if value is not None else "",
        }
    if isinstance(config, AgentNodeConfig):
        return _execute_agent_node(node, config, input_values)
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
                    file_name_template=config.file_name_template,
                )
            )
        return {
            "outputs": {config.input.key: value},
            "output_previews": [preview],
            "saved_outputs": saved_outputs,
            "final_result": "" if value is None else str(value),
        }
    if isinstance(config, ConditionNodeConfig):
        return _execute_condition_node(config, input_values)
    raise ValueError(f"Unsupported node family '{config.family}'.")


def _execute_agent_node(
    node: NodeSystemGraphNode,
    config: AgentNodeConfig,
    input_values: dict[str, Any],
) -> dict[str, Any]:
    selected_skills: list[str] = []
    skill_outputs: list[dict[str, Any]] = []
    skill_context: dict[str, Any] = {}
    registry = get_skill_registry()

    for skill in config.skills:
        skill_func = registry.get(skill.skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill.skill_key}' is not registered.")
        skill_inputs = {
            target_key: _resolve_reference(source_ref, inputs=input_values, response={}, skills=skill_context, context=skill_context)
            for target_key, source_ref in skill.input_mapping.items()
        }
        skill_result = _invoke_skill(skill_func, skill_inputs)
        selected_skills.append(skill.skill_key)
        skill_context[skill.name] = skill_result
        for context_key, source_ref in skill.context_binding.items():
            skill_context[context_key] = _resolve_reference(
                source_ref,
                inputs=input_values,
                response={},
                skills=skill_context,
                context=skill_context,
            )
        skill_outputs.append(
            {
                "skill_name": skill.name,
                "skill_key": skill.skill_key,
                "inputs": skill_inputs,
                "outputs": skill_result,
            }
        )

    response_payload: dict[str, Any] = {}
    bound_output_values = {
        output.key: _resolve_reference(
            config.output_binding.get(output.key, f"$response.{output.key}"),
            inputs=input_values,
            response={},
            skills=skill_context,
            context=skill_context,
        )
        for output in config.outputs
    }

    if any(value in (None, "") for value in bound_output_values.values()):
        response_payload = _generate_agent_response(config, input_values, skill_context)

    output_values = {
        output.key: _resolve_reference(
            config.output_binding.get(output.key, f"$response.{output.key}"),
            inputs=input_values,
            response=response_payload,
            skills=skill_context,
            context=skill_context,
        )
        for output in config.outputs
    }

    return {
        "outputs": output_values,
        "response": response_payload,
        "selected_skills": selected_skills,
        "skill_outputs": skill_outputs,
        "final_result": _first_truthy(output_values.values()) or response_payload.get("summary") or "",
    }


def _generate_agent_response(
    config: AgentNodeConfig,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
) -> dict[str, Any]:
    output_keys = [output.key for output in config.outputs]
    if not output_keys:
        return {"summary": ""}

    user_prompt = "\n".join(
        [
            f"Task instruction: {config.task_instruction or 'Complete the workflow task.'}",
            f"Inputs: {input_values}",
            f"Skill context: {skill_context}",
            f"Return a concise response that fills these keys: {', '.join(output_keys)}.",
        ]
    )

    content = _chat_with_local_model(
        system_prompt=config.system_instruction or "You are a precise workflow agent.",
        user_prompt=user_prompt,
        temperature=0.2,
        max_tokens=160,
    )

    response_payload: dict[str, Any] = {"summary": content}
    if len(output_keys) == 1:
        response_payload[output_keys[0]] = content
        return response_payload

    for key in output_keys:
        response_payload[key] = content
    return response_payload


def _invoke_skill(skill_func: Any, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    signature = inspect.signature(skill_func)
    parameters = list(signature.parameters.values())

    if len(parameters) >= 2:
        return skill_func({}, skill_inputs)
    return skill_func(**skill_inputs)


def _execute_condition_node(config: ConditionNodeConfig, input_values: dict[str, Any]) -> dict[str, Any]:
    if config.condition_mode.value != "rule":
        raise ValueError("Condition node currently only supports rule mode.")

    rule_value = _resolve_reference(
        config.rule.source,
        inputs=input_values,
        response={},
        skills={},
        context={},
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
    if value_type != "json" or not isinstance(value, str):
        return value

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value

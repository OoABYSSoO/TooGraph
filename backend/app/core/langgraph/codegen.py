from __future__ import annotations

import ast
from pprint import pformat
from typing import Any

from app.core.schemas.node_system import (
    AgentModelSource,
    AgentThinkingMode,
    ConditionOperator,
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemGraphCore,
    NodeSystemGraphPayload,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemStateDefinition,
    NodeSystemStateType,
    NodeSystemSubgraphNode,
    StateWriteMode,
)

EDITOR_ONLY_METADATA_KEYS = {"toograph_state_key_counter"}


STANDALONE_LANGGRAPH_SOURCE_TEMPLATE = r'''from __future__ import annotations

import copy
import json
import os
import re
import urllib.error
import urllib.request
from collections import Counter
from typing import Any, Annotated, TypedDict

from langgraph.graph import END, START, StateGraph


TOOGRAPH_EXPORT_VERSION = 1
TOOGRAPH_STANDALONE_EXPORT = True
GRAPH_PAYLOAD = __GRAPH_PAYLOAD_LITERAL__
TOOGRAPH_EDITOR_GRAPH = __EDITOR_PAYLOAD_LITERAL__
INTERRUPT_AFTER_CONFIG = __INTERRUPT_AFTER_LITERAL__


RUNTIME_START = "__start__"
RUNTIME_END = "__end__"


def _inflate_graph_core_payload(payload: dict[str, Any]) -> dict[str, Any]:
    inflated = dict(payload or {})
    inflated["metadata"] = dict(inflated.get("metadata") or {})
    inflated["state_schema"] = dict(inflated.get("state_schema") or {})
    inflated["edges"] = list(inflated.get("edges") or [])
    inflated["conditional_edges"] = list(inflated.get("conditional_edges") or [])
    inflated_nodes: dict[str, dict[str, Any]] = {}
    for node_name, node_payload in dict(inflated.get("nodes") or {}).items():
        inflated_node = dict(node_payload or {})
        inflated_node.setdefault("kind", "agent")
        inflated_node.setdefault("reads", [])
        inflated_node.setdefault("writes", [])
        inflated_node.setdefault("config", {})
        config = inflated_node.get("config")
        if inflated_node.get("kind") == "subgraph" and isinstance(config, dict) and isinstance(config.get("graph"), dict):
            inflated_config = dict(config)
            inflated_config["graph"] = _inflate_graph_core_payload(config["graph"])
            inflated_node["config"] = inflated_config
        inflated_nodes[str(node_name)] = inflated_node
    inflated["nodes"] = inflated_nodes
    return inflated


GRAPH = _inflate_graph_core_payload(GRAPH_PAYLOAD)


def _replace(_current: Any, update: Any) -> Any:
    return update


def _build_state_schema(graph: dict[str, Any]):
    annotations = {
        state_name: Annotated[Any, _replace]
        for state_name in dict(graph.get("state_schema") or {})
    }
    return TypedDict("ExportedGraphState", annotations, total=False)


def _runtime_graph_endpoint(node_name: str) -> str:
    if node_name == RUNTIME_START:
        return START
    if node_name == RUNTIME_END:
        return END
    return node_name


def _node_kind(graph: dict[str, Any], node_name: str) -> str:
    return str(dict(graph.get("nodes") or {}).get(node_name, {}).get("kind") or "")


def _node_reads(node: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(binding or {}) for binding in list(node.get("reads") or [])]


def _node_writes(node: dict[str, Any]) -> list[dict[str, Any]]:
    return [dict(binding or {}) for binding in list(node.get("writes") or [])]


def _binding_state(binding: dict[str, Any]) -> str:
    return str(binding.get("state") or "").strip()


def _input_state_keys(graph: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for node in dict(graph.get("nodes") or {}).values():
        if dict(node).get("kind") != "input":
            continue
        for binding in _node_writes(dict(node)):
            state_key = _binding_state(binding)
            if state_key:
                keys.add(state_key)
    return keys


def _default_empty_state_value(state_type: str) -> Any:
    if state_type == "number":
        return 0
    if state_type == "boolean":
        return False
    if state_type == "json":
        return {}
    if state_type == "capability":
        return {"kind": "none"}
    return ""


def _build_graph_state_values(
    graph: dict[str, Any],
    supplied_values: dict[str, Any] | None = None,
    *,
    allow_input_state_overrides: bool = False,
) -> dict[str, Any]:
    input_keys = _input_state_keys(graph)
    supplied = dict(supplied_values or {})
    initialized: dict[str, Any] = {}
    for state_name, definition in dict(graph.get("state_schema") or {}).items():
        state_definition = dict(definition or {})
        state_type = str(state_definition.get("type") or "text")
        if state_name in input_keys:
            initialized[state_name] = copy.deepcopy(state_definition.get("value"))
        else:
            initialized[state_name] = _default_empty_state_value(state_type)
    if allow_input_state_overrides:
        for state_name, value in supplied.items():
            if state_name in input_keys:
                initialized[state_name] = copy.deepcopy(value)
    return initialized


def _collect_node_inputs(node: dict[str, Any], state_values: dict[str, Any]) -> dict[str, Any]:
    resolved: dict[str, Any] = {}
    for binding in _node_reads(node):
        state_key = _binding_state(binding)
        if state_key:
            resolved[state_key] = copy.deepcopy(state_values.get(state_key))
    return resolved


def _append_state_value(previous_value: Any, next_value: Any) -> Any:
    if next_value is None:
        return copy.deepcopy(previous_value)
    previous = copy.deepcopy(previous_value)
    value = copy.deepcopy(next_value)
    if isinstance(previous, list):
        if isinstance(value, list):
            return previous + value
        return previous + [value]
    if previous is None or previous == "" or previous == {}:
        return value if isinstance(value, list) else [value]
    if isinstance(previous, str) and isinstance(value, str):
        return "\n\n".join(part for part in [previous.strip(), value.strip()] if part)
    if isinstance(previous, dict) and isinstance(value, dict):
        merged = dict(previous)
        merged.update(value)
        return merged
    if isinstance(value, list):
        return [previous] + value
    return [previous, value]


def _apply_state_writes(
    node_name: str,
    node: dict[str, Any],
    output_values: dict[str, Any],
    state_values: dict[str, Any],
) -> dict[str, Any]:
    del node_name
    updates: dict[str, Any] = {}
    for binding in _node_writes(node):
        state_key = _binding_state(binding)
        if not state_key:
            continue
        raw_value = output_values.get(state_key)
        mode = str(binding.get("mode") or "replace")
        if mode == "append":
            value = _append_state_value(state_values.get(state_key), raw_value)
        else:
            value = copy.deepcopy(raw_value)
        state_values[state_key] = value
        updates[state_key] = value
    return updates


def _read_path(payload: Any, path: str) -> Any:
    current = payload
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _resolve_reference(reference: Any, *, inputs: dict[str, Any], graph: dict[str, Any], state_values: dict[str, Any]) -> Any:
    if not isinstance(reference, str) or not reference.startswith("$"):
        return reference
    if reference.startswith("$inputs."):
        return _read_path(inputs, reference[len("$inputs."):])
    if reference.startswith("$state."):
        return _read_path(state_values, reference[len("$state."):])
    if reference.startswith("$graph."):
        return _read_path(graph, reference[len("$graph."):])
    return reference


def _resolve_condition_source(source: str, *, inputs: dict[str, Any], graph: dict[str, Any], state_values: dict[str, Any]) -> Any:
    if source.startswith("$"):
        return _resolve_reference(source, inputs=inputs, graph=graph, state_values=state_values)
    if source in inputs:
        return inputs[source]
    if source in state_values:
        return state_values[source]
    return source


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


def _normalize_condition_operands(left_value: Any, right_value: Any) -> tuple[Any, Any]:
    left_number = _parse_condition_number(left_value)
    right_number = _parse_condition_number(right_value)
    if left_number is not None and right_number is not None:
        return left_number, right_number
    return left_value, right_value


def _coerce_condition_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


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


def _resolve_branch_key(branches: list[str], branch_mapping: dict[str, str], condition_result: Any) -> str | None:
    lookup_keys = [str(condition_result).lower(), str(condition_result)]
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


def _compile_graph_plan(graph: dict[str, Any]) -> dict[str, Any]:
    nodes = dict(graph.get("nodes") or {})
    edges = [dict(edge or {}) for edge in list(graph.get("edges") or [])]
    conditional_edges = [dict(edge or {}) for edge in list(graph.get("conditional_edges") or [])]
    conditional_edges_by_source = {str(edge.get("source") or ""): edge for edge in conditional_edges}
    incoming_counts = Counter()
    outgoing_counts = Counter()
    for edge in edges:
        incoming_counts[str(edge.get("target") or "")] += 1
        outgoing_counts[str(edge.get("source") or "")] += 1
    for edge in conditional_edges:
        source = str(edge.get("source") or "")
        for target in dict(edge.get("branches") or {}).values():
            incoming_counts[str(target)] += 1
            outgoing_counts[source] += 1

    runtime_nodes = {
        node_name: node
        for node_name, node in nodes.items()
        if str(dict(node).get("kind") or "") in {"agent", "subgraph"}
    }
    runtime_edges: list[dict[str, str]] = []
    runtime_condition_routes: list[dict[str, Any]] = []
    runtime_incoming_counts = Counter()
    runtime_outgoing_counts = Counter()
    runtime_entry_candidates: set[str] = set()
    route_sources: set[str] = set()

    def runtime_target_for_visual_node(target: str) -> str | None:
        target_kind = _node_kind(graph, target)
        if target_kind in {"agent", "subgraph"}:
            return target
        if target_kind == "output":
            return RUNTIME_END
        return None

    def runtime_route_key(path: list[tuple[str, str, str]]) -> str:
        return " -> ".join(f"{condition}.{branch}" for condition, branch, _target in path)

    def runtime_condition_paths(
        condition_name: str,
        *,
        visited_conditions: set[str] | None = None,
    ) -> list[tuple[str, str, list[tuple[str, str, str]]]]:
        if condition_name in (visited_conditions or set()):
            raise ValueError(f"Condition chain starting at '{condition_name}' contains a condition-only cycle.")
        conditional_edge = conditional_edges_by_source.get(condition_name)
        if conditional_edge is None:
            raise ValueError(f"Condition '{condition_name}' is missing conditional edge branch targets.")
        paths: list[tuple[str, str, list[tuple[str, str, str]]]] = []
        next_visited = {*(visited_conditions or set()), condition_name}
        for branch, visual_target in dict(conditional_edge.get("branches") or {}).items():
            target = str(visual_target)
            step = (condition_name, str(branch), target)
            if _node_kind(graph, target) == "condition":
                for runtime_target, final_visual_target, nested_path in runtime_condition_paths(
                    target,
                    visited_conditions=next_visited,
                ):
                    paths.append((runtime_target, final_visual_target, [step, *nested_path]))
                continue
            runtime_target = runtime_target_for_visual_node(target)
            if runtime_target is None:
                continue
            paths.append((runtime_target, target, [step]))
        return paths

    def add_runtime_condition_route(source: str, condition_name: str) -> None:
        route_key = f"{source}:{condition_name}"
        if route_key in route_sources:
            return
        route_sources.add(route_key)
        branches: dict[str, str] = {}
        branch_paths: dict[str, list[tuple[str, str, str]]] = {}
        for runtime_target, _visual_target, path in runtime_condition_paths(condition_name):
            path_key = runtime_route_key(path)
            branches[path_key] = runtime_target
            branch_paths[path_key] = path
            if runtime_target != RUNTIME_END:
                runtime_incoming_counts[runtime_target] += 1
        if not branches:
            raise ValueError(f"Condition '{condition_name}' has no branch target compatible with the standalone runtime.")
        if source != RUNTIME_START:
            runtime_outgoing_counts[source] += 1
        runtime_condition_routes.append({
            "source": source,
            "condition": condition_name,
            "branches": branches,
            "branch_paths": branch_paths,
        })

    for edge in edges:
        source = str(edge.get("source") or "")
        target = str(edge.get("target") or "")
        source_kind = _node_kind(graph, source)
        target_kind = _node_kind(graph, target)
        if source_kind in {"agent", "subgraph"} and target_kind in {"agent", "subgraph"}:
            runtime_edges.append({"source": source, "target": target})
            runtime_outgoing_counts[source] += 1
            runtime_incoming_counts[target] += 1
            continue
        if source_kind in {"agent", "subgraph"} and target_kind == "condition":
            add_runtime_condition_route(source, target)
            continue
        if source_kind == "input" and target_kind in {"agent", "subgraph"}:
            runtime_entry_candidates.add(target)
            continue
        if source_kind == "input" and target_kind == "condition":
            add_runtime_condition_route(RUNTIME_START, target)
            continue

    runtime_entry_nodes = sorted({
        *runtime_entry_candidates,
        *[
            node_name
            for node_name in runtime_nodes
            if runtime_incoming_counts.get(node_name, 0) == 0
        ],
    })
    runtime_terminal_nodes = [
        node_name
        for node_name in runtime_nodes
        if runtime_outgoing_counts.get(node_name, 0) == 0
    ]
    return {
        "runtime_nodes": runtime_nodes,
        "runtime_edges": runtime_edges,
        "runtime_condition_routes": runtime_condition_routes,
        "runtime_entry_nodes": runtime_entry_nodes,
        "runtime_terminal_nodes": runtime_terminal_nodes,
    }


def _extract_json_object(text: str) -> Any:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise


def _chat_openai_compatible(messages: list[dict[str, str]], *, temperature: float, model: str | None = None) -> str:
    mock_response = os.environ.get("TOOGRAPH_EXPORT_MOCK_LLM_RESPONSE")
    if mock_response is not None:
        return mock_response

    base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    model_name = model or os.environ.get("OPENAI_MODEL") or os.environ.get("MODEL") or "gpt-4o-mini"
    api_key = os.environ.get("OPENAI_API_KEY", "")
    timeout = float(os.environ.get("OPENAI_TIMEOUT", "60"))
    request_body = json.dumps({
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
    }).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=request_body,
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Model request failed with HTTP {exc.code}: {details}") from exc
    return str(payload["choices"][0]["message"]["content"])


def _run_agent_node(node_name: str, node: dict[str, Any], input_values: dict[str, Any]) -> dict[str, Any]:
    config = dict(node.get("config") or {})
    if str(config.get("skillKey") or "").strip():
        raise NotImplementedError(
            f"Agent node '{node_name}' uses TooGraph Skill '{config.get('skillKey')}', "
            "which is not bundled in this standalone export yet."
        )
    for value in input_values.values():
        if isinstance(value, dict) and value.get("kind") in {"skill", "subgraph"}:
            raise NotImplementedError(
                f"Agent node '{node_name}' received a dynamic capability state. "
                "Standalone dynamic Skill/Subgraph capability execution is not bundled yet."
            )

    output_keys = [_binding_state(binding) for binding in _node_writes(node) if _binding_state(binding)]
    if not output_keys:
        return {"outputs": {}, "final_result": ""}

    task_instruction = str(config.get("taskInstruction") or "").strip()
    output_contract = {
        key: "Return the value for this TooGraph state key."
        for key in output_keys
    }
    system_prompt = (
        "You are executing one agent node from a TooGraph graph exported as standalone LangGraph Python. "
        "Return only a JSON object. The JSON object must contain exactly the requested output state keys."
    )
    user_prompt = "\n\n".join([
        f"Node id: {node_name}",
        f"Task instruction:\n{task_instruction or '(none)'}",
        "Input state values:\n" + json.dumps(input_values, ensure_ascii=False, indent=2),
        "Output contract:\n" + json.dumps(output_contract, ensure_ascii=False, indent=2),
    ])
    temperature = float(config.get("temperature", 0.2))
    content = _chat_openai_compatible(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=temperature,
        model=str(config.get("model") or "").strip() or None,
    )
    try:
        parsed = _extract_json_object(content)
    except json.JSONDecodeError:
        if len(output_keys) == 1:
            return {"outputs": {output_keys[0]: content}, "final_result": content}
        raise ValueError(f"Agent node '{node_name}' did not return valid JSON for multiple output states.")

    output_source = parsed.get("outputs") if isinstance(parsed, dict) and isinstance(parsed.get("outputs"), dict) else parsed
    outputs: dict[str, Any] = {}
    if isinstance(output_source, dict):
        for key in output_keys:
            outputs[key] = copy.deepcopy(output_source.get(key))
    elif len(output_keys) == 1:
        outputs[output_keys[0]] = copy.deepcopy(output_source)
    else:
        raise ValueError(f"Agent node '{node_name}' returned a non-object response for multiple output states.")
    first_value = next((value for value in outputs.values() if value not in (None, "", [], {})), "")
    return {"outputs": outputs, "final_result": "" if first_value is None else str(first_value)}


def _subgraph_input_boundaries(node: dict[str, Any]) -> list[tuple[str, str]]:
    graph = dict(dict(node.get("config") or {}).get("graph") or {})
    boundaries: list[tuple[str, str]] = []
    for inner_node_name, inner_node in dict(graph.get("nodes") or {}).items():
        inner = dict(inner_node or {})
        if inner.get("kind") == "input" and _node_writes(inner):
            boundaries.append((str(inner_node_name), _binding_state(_node_writes(inner)[0])))
    return boundaries


def _subgraph_output_boundaries(node: dict[str, Any]) -> list[tuple[str, str]]:
    graph = dict(dict(node.get("config") or {}).get("graph") or {})
    boundaries: list[tuple[str, str]] = []
    for inner_node_name, inner_node in dict(graph.get("nodes") or {}).items():
        inner = dict(inner_node or {})
        if inner.get("kind") == "output" and _node_reads(inner):
            boundaries.append((str(inner_node_name), _binding_state(_node_reads(inner)[0])))
    return boundaries


def _run_subgraph_node(node_name: str, node: dict[str, Any], input_values: dict[str, Any]) -> dict[str, Any]:
    subgraph = copy.deepcopy(dict(dict(node.get("config") or {}).get("graph") or {}))
    state_schema = dict(subgraph.get("state_schema") or {})
    for index, (_inner_node_name, inner_state_key) in enumerate(_subgraph_input_boundaries(node)):
        reads = _node_reads(node)
        external_binding = reads[index] if index < len(reads) else None
        if external_binding is None:
            raise ValueError(f"Subgraph node '{node_name}' is missing required input {index + 1}.")
        if inner_state_key not in state_schema:
            raise ValueError(f"Subgraph node '{node_name}' input boundary references unknown state '{inner_state_key}'.")
        state_schema[inner_state_key] = {
            **dict(state_schema[inner_state_key] or {}),
            "value": copy.deepcopy(input_values.get(_binding_state(external_binding))),
        }
    subgraph["state_schema"] = state_schema
    subgraph_state = _invoke_graph_payload(subgraph)

    output_values_by_internal_state = {
        inner_state_key: copy.deepcopy(subgraph_state.get(inner_state_key))
        for _inner_node_name, inner_state_key in _subgraph_output_boundaries(node)
    }
    parent_outputs: dict[str, Any] = {}
    writes = _node_writes(node)
    for index, (_inner_node_name, inner_state_key) in enumerate(_subgraph_output_boundaries(node)):
        external_binding = writes[index] if index < len(writes) else None
        if external_binding is None:
            raise ValueError(f"Subgraph node '{node_name}' is missing required output {index + 1}.")
        parent_outputs[_binding_state(external_binding)] = copy.deepcopy(output_values_by_internal_state.get(inner_state_key))
    first_value = next((value for value in parent_outputs.values() if value not in (None, "", [], {})), "")
    return {
        "outputs": parent_outputs,
        "final_result": "" if first_value is None else str(first_value),
        "subgraph": {
            "status": "completed",
            "output_values": output_values_by_internal_state,
        },
    }


def _run_condition_node(graph: dict[str, Any], node_name: str, node: dict[str, Any], input_values: dict[str, Any], state_values: dict[str, Any]) -> dict[str, Any]:
    del node_name
    config = dict(node.get("config") or {})
    rule = dict(config.get("rule") or {"source": "result", "operator": "exists", "value": None})
    branches = list(config.get("branches") or ["true", "false", "exhausted"])
    branch_mapping = dict(config.get("branchMapping") or {"true": "true", "false": "false"})
    source = str(rule.get("source") or "result")
    operator = str(rule.get("operator") or "exists")
    rule_value = _resolve_condition_source(source, inputs=input_values, graph={"metadata": graph.get("metadata", {})}, state_values=state_values)
    condition_result = _evaluate_condition_rule(rule_value, operator, rule.get("value"))
    branch_key = _resolve_branch_key(branches, branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch.")
    return {
        "outputs": {branch_key: True},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


def _run_runtime_node(graph: dict[str, Any], node_name: str, node: dict[str, Any], input_values: dict[str, Any], state_values: dict[str, Any]) -> dict[str, Any]:
    kind = str(node.get("kind") or "")
    if kind == "agent":
        return _run_agent_node(node_name, node, input_values)
    if kind == "subgraph":
        return _run_subgraph_node(node_name, node, input_values)
    if kind == "condition":
        return _run_condition_node(graph, node_name, node, input_values, state_values)
    raise ValueError(f"Unsupported runtime node kind '{kind}'.")


def build_graph(graph: dict[str, Any] | None = None, *, interrupt_after: list[str] | None = None):
    graph_payload = _inflate_graph_core_payload(graph or GRAPH)
    plan = _compile_graph_plan(graph_payload)
    runtime_nodes = dict(plan["runtime_nodes"])
    routes = list(plan["runtime_condition_routes"])
    if not runtime_nodes and not routes:
        return None

    workflow = StateGraph(_build_state_schema(graph_payload))

    def make_node(node_name: str):
        node = dict(runtime_nodes[node_name])

        def _call(current_values: dict[str, Any]) -> dict[str, Any]:
            state_values = dict(current_values or {})
            input_values = _collect_node_inputs(node, state_values)
            body = _run_runtime_node(graph_payload, node_name, node, input_values, state_values)
            outputs = dict(body.get("outputs") or {})
            return _apply_state_writes(node_name, node, outputs, state_values)

        return _call

    def make_router(route: dict[str, Any]):
        conditional_edges_by_source = {
            str(edge.get("source") or ""): dict(edge or {})
            for edge in list(graph_payload.get("conditional_edges") or [])
        }

        def route_key_for_steps(selected_steps: list[tuple[str, str, str]]) -> str:
            for route_key, planned_steps in dict(route.get("branch_paths") or {}).items():
                if [tuple(step) for step in planned_steps] == selected_steps:
                    return str(route_key)
            rendered_path = " -> ".join(
                f"{condition_name}.{branch}->{target}"
                for condition_name, branch, target in selected_steps
            )
            raise ValueError(f"Condition route path is not compiled into the LangGraph plan: {rendered_path}")

        def _route(current_values: dict[str, Any]) -> str:
            state_values = dict(current_values or {})
            condition_name = str(route.get("condition") or "")
            selected_steps: list[tuple[str, str, str]] = []
            visited_conditions: set[str] = set()
            while True:
                if condition_name in visited_conditions:
                    raise ValueError(f"Condition route contains a condition-only cycle at '{condition_name}'.")
                visited_conditions.add(condition_name)
                condition_node = dict(dict(graph_payload.get("nodes") or {}).get(condition_name) or {})
                input_values = _collect_node_inputs(condition_node, state_values)
                body = _run_condition_node(graph_payload, condition_name, condition_node, input_values, state_values)
                branch = str(body.get("selected_branch") or "").strip()
                if not branch:
                    raise ValueError(f"Condition node '{condition_name}' did not produce a selected branch.")
                conditional_edge = conditional_edges_by_source.get(condition_name)
                if conditional_edge is None:
                    raise ValueError(f"Condition node '{condition_name}' has no conditional edge mapping.")
                target = str(dict(conditional_edge.get("branches") or {}).get(branch) or "")
                if not target:
                    raise ValueError(
                        f"Condition node '{condition_name}' selected branch '{branch}', but that branch has no target."
                    )
                selected_steps.append((condition_name, branch, target))
                if _node_kind(graph_payload, target) == "condition":
                    condition_name = target
                    continue
                return route_key_for_steps(selected_steps)

        return _route

    for node_name in runtime_nodes:
        workflow.add_node(node_name, make_node(node_name))
    for node_name in list(plan["runtime_entry_nodes"]):
        workflow.add_edge(START, node_name)
    for edge in list(plan["runtime_edges"]):
        workflow.add_edge(edge["source"], edge["target"])
    for route in routes:
        workflow.add_conditional_edges(
            _runtime_graph_endpoint(str(route["source"])),
            make_router(route),
            path_map={
                branch: _runtime_graph_endpoint(target)
                for branch, target in dict(route["branches"]).items()
            },
        )
    for node_name in list(plan["runtime_terminal_nodes"]):
        workflow.add_edge(node_name, END)

    configured_interrupt_after = [
        node_name
        for node_name in list(interrupt_after or [])
        if node_name in runtime_nodes
    ]
    return workflow.compile(interrupt_after=configured_interrupt_after or None)


def _invoke_graph_payload(graph: dict[str, Any], initial_state: dict[str, Any] | None = None) -> dict[str, Any]:
    graph_payload = _inflate_graph_core_payload(graph)
    state_values = _build_graph_state_values(
        graph_payload,
        initial_state,
        allow_input_state_overrides=True,
    )
    compiled = build_graph(graph_payload, interrupt_after=list(dict(graph_payload.get("metadata") or {}).get("interrupt_after") or []))
    if compiled is None:
        return state_values
    return compiled.invoke(state_values)


def invoke_graph(initial_state: dict[str, Any] | None = None) -> dict[str, Any]:
    return _invoke_graph_payload(GRAPH, initial_state)


if __name__ == "__main__":
    print(json.dumps(invoke_graph(), ensure_ascii=False, indent=2))
'''


def generate_langgraph_python_source(graph: NodeSystemGraphPayload) -> str:
    payload = _build_export_graph_payload(graph)
    editor_payload = _build_editor_graph_payload(graph)
    interrupt_after = _normalize_interrupt_config(graph.metadata.get("interrupt_after"))
    payload_literal = pformat(payload, sort_dicts=False, width=100)
    editor_payload_literal = pformat(editor_payload, sort_dicts=False, width=100)
    interrupt_after_literal = pformat(interrupt_after, sort_dicts=False, width=100)

    return (
        STANDALONE_LANGGRAPH_SOURCE_TEMPLATE
        .replace("__GRAPH_PAYLOAD_LITERAL__", payload_literal)
        .replace("__EDITOR_PAYLOAD_LITERAL__", editor_payload_literal)
        .replace("__INTERRUPT_AFTER_LITERAL__", interrupt_after_literal)
    )


def import_graph_payload_from_python_source(source: str) -> NodeSystemGraphPayload:
    assignments = _parse_literal_assignments(source)
    if assignments.get("TOOGRAPH_EXPORT_VERSION") != 1 or "TOOGRAPH_EDITOR_GRAPH" not in assignments:
        raise ValueError("Python file is not a TooGraph reversible export.")

    editor_payload = assignments["TOOGRAPH_EDITOR_GRAPH"]
    if not isinstance(editor_payload, dict):
        raise ValueError("TooGraph editor graph payload must be a dictionary.")

    graph_payload = dict(editor_payload)
    graph_payload["graph_id"] = None
    return NodeSystemGraphPayload.model_validate(graph_payload)


def _parse_literal_assignments(source: str) -> dict[str, Any]:
    try:
        module = ast.parse(source)
    except SyntaxError as exc:
        raise ValueError("Python source could not be parsed.") from exc

    assignments: dict[str, Any] = {}
    for statement in module.body:
        if not isinstance(statement, ast.Assign) or len(statement.targets) != 1:
            continue
        target = statement.targets[0]
        if not isinstance(target, ast.Name):
            continue
        if target.id not in {"TOOGRAPH_EXPORT_VERSION", "TOOGRAPH_EDITOR_GRAPH", "GRAPH_PAYLOAD"}:
            continue
        try:
            assignments[target.id] = ast.literal_eval(statement.value)
        except (ValueError, SyntaxError) as exc:
            raise ValueError(f"TooGraph export constant '{target.id}' is not a safe literal.") from exc
    return assignments


def _build_editor_graph_payload(graph: NodeSystemGraphPayload) -> dict[str, Any]:
    return graph.model_dump(mode="json", by_alias=True, exclude={"graph_id"})


def _build_export_graph_payload(graph: NodeSystemGraphPayload) -> dict[str, Any]:
    payload = _build_export_graph_core_payload(graph)
    payload["name"] = graph.name
    return payload


def _build_export_graph_core_payload(graph: NodeSystemGraphCore) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "nodes": {
            node_name: _build_export_node_payload(node)
            for node_name, node in graph.nodes.items()
        },
    }

    state_schema = {
        state_name: _build_export_state_definition(definition)
        for state_name, definition in graph.state_schema.items()
    }
    if state_schema:
        payload["state_schema"] = state_schema
    if graph.edges:
        payload["edges"] = [edge.model_dump(mode="json", by_alias=True) for edge in graph.edges]
    if graph.conditional_edges:
        payload["conditional_edges"] = [
            edge.model_dump(mode="json", by_alias=True)
            for edge in graph.conditional_edges
        ]
    runtime_metadata = {
        key: value
        for key, value in graph.metadata.items()
        if key not in EDITOR_ONLY_METADATA_KEYS
    }
    if runtime_metadata:
        payload["metadata"] = runtime_metadata

    return payload


def _build_export_state_definition(definition: NodeSystemStateDefinition) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if definition.type != NodeSystemStateType.TEXT:
        payload["type"] = definition.type.value
    if definition.value is not None:
        payload["value"] = definition.value
    return payload


def _build_export_node_payload(
    node: NodeSystemInputNode | NodeSystemAgentNode | NodeSystemConditionNode | NodeSystemOutputNode | NodeSystemSubgraphNode,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"kind": node.kind}
    if node.reads:
        payload["reads"] = [{"state": binding.state} for binding in node.reads]
    if node.writes:
        payload["writes"] = [_build_export_write_binding(binding) for binding in node.writes]

    config = _build_export_node_config(node)
    if config:
        payload["config"] = config
    return payload


def _build_export_write_binding(binding: Any) -> dict[str, Any]:
    payload = {"state": binding.state}
    if binding.mode != StateWriteMode.REPLACE:
        payload["mode"] = binding.mode.value
    return payload


def _build_export_node_config(
    node: NodeSystemInputNode | NodeSystemAgentNode | NodeSystemConditionNode | NodeSystemOutputNode | NodeSystemSubgraphNode,
) -> dict[str, Any]:
    if isinstance(node, NodeSystemAgentNode):
        return _build_export_agent_config(node)
    if isinstance(node, NodeSystemConditionNode):
        return _build_export_condition_config(node)
    if isinstance(node, NodeSystemSubgraphNode):
        return {"graph": _build_export_graph_core_payload(node.config.graph)}
    return {}


def _build_export_agent_config(node: NodeSystemAgentNode) -> dict[str, Any]:
    config: dict[str, Any] = {}
    if node.config.skill_key:
        config["skillKey"] = node.config.skill_key
    if node.config.task_instruction:
        config["taskInstruction"] = node.config.task_instruction
    if node.config.model_source == AgentModelSource.OVERRIDE:
        config["modelSource"] = node.config.model_source.value
        if node.config.model:
            config["model"] = node.config.model
    if node.config.thinking_mode != AgentThinkingMode.OFF:
        config["thinkingMode"] = node.config.thinking_mode.value
    if node.config.temperature != 0.2:
        config["temperature"] = node.config.temperature
    return config


def _build_export_condition_config(node: NodeSystemConditionNode) -> dict[str, Any]:
    config: dict[str, Any] = {}
    if node.config.branches:
        config["branches"] = list(node.config.branches)
    if node.config.loop_limit != 5:
        config["loopLimit"] = node.config.loop_limit
    if node.config.branch_mapping:
        config["branchMapping"] = dict(node.config.branch_mapping)

    rule = node.config.rule
    rule_payload: dict[str, Any] = {}
    if rule.source != "result":
        rule_payload["source"] = rule.source
    if rule.operator != ConditionOperator.EXISTS:
        rule_payload["operator"] = rule.operator.value
    if rule.value is not None:
        rule_payload["value"] = rule.value
    if rule_payload:
        rule_payload.setdefault("source", rule.source)
        config["rule"] = rule_payload
    return config


def _normalize_interrupt_config(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]

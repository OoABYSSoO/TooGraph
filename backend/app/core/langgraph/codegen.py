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


def generate_langgraph_python_source(graph: NodeSystemGraphPayload) -> str:
    payload = _build_export_graph_payload(graph)
    editor_payload = _build_editor_graph_payload(graph)
    interrupt_after = _normalize_interrupt_config(graph.metadata.get("interrupt_after"))
    payload_literal = pformat(payload, sort_dicts=False, width=100)
    editor_payload_literal = pformat(editor_payload, sort_dicts=False, width=100)
    interrupt_after_literal = pformat(interrupt_after, sort_dicts=False, width=100)

    return f"""from __future__ import annotations

from typing import Any, Annotated
from typing_extensions import TypedDict

from langgraph.graph import END, START, StateGraph

from app.core.langgraph.compiler import compile_graph_to_langgraph_plan
from app.core.runtime.node_system_executor import _execute_node
from app.core.runtime.state import create_initial_run_state
from app.core.runtime.state_io import apply_state_writes, build_graph_state_values, collect_node_inputs, initialize_graph_state
from app.core.schemas.node_system import NodeSystemGraphPayload


TOOGRAPH_EXPORT_VERSION = 1
GRAPH_PAYLOAD = {payload_literal}
TOOGRAPH_EDITOR_GRAPH = {editor_payload_literal}
INTERRUPT_AFTER_CONFIG = {interrupt_after_literal}


def _inflate_graph_core_payload(payload: dict[str, Any]) -> dict[str, Any]:
    inflated = dict(payload)
    inflated["metadata"] = dict(payload.get("metadata", {{}}))
    inflated["state_schema"] = dict(payload.get("state_schema", {{}}))
    inflated["edges"] = list(payload.get("edges", []))
    inflated["conditional_edges"] = list(payload.get("conditional_edges", []))
    inflated_nodes: dict[str, dict[str, Any]] = {{}}
    for node_name, node_payload in dict(payload.get("nodes", {{}})).items():
        inflated_node = dict(node_payload)
        inflated_node.setdefault("ui", {{"position": {{"x": 0, "y": 0}}}})
        inflated_node.setdefault("reads", [])
        inflated_node.setdefault("writes", [])
        config = inflated_node.get("config")
        if inflated_node.get("kind") == "subgraph" and isinstance(config, dict) and isinstance(config.get("graph"), dict):
            inflated_config = dict(config)
            inflated_config["graph"] = _inflate_graph_core_payload(config["graph"])
            inflated_node["config"] = inflated_config
        inflated_nodes[node_name] = inflated_node
    inflated["nodes"] = inflated_nodes
    return inflated


def _inflate_graph_payload(payload: dict[str, Any]) -> dict[str, Any]:
    return _inflate_graph_core_payload(payload)


GRAPH = NodeSystemGraphPayload.model_validate(_inflate_graph_payload(GRAPH_PAYLOAD))
BUILD_PLAN = compile_graph_to_langgraph_plan(GRAPH)
RUNTIME_NODES = list(BUILD_PLAN.runtime_nodes)
INTERRUPT_AFTER = [node_name for node_name in INTERRUPT_AFTER_CONFIG if node_name in RUNTIME_NODES]


def _replace(_current: Any, update: Any) -> Any:
    return update


def _build_state_schema():
    annotations = {{
        state_name: Annotated[Any, _replace]
        for state_name in GRAPH.state_schema
    }}
    return TypedDict("ExportedGraphState", annotations, total=False)


def _runtime_graph_endpoint(node_name: str) -> str:
    if node_name == "__start__":
        return START
    if node_name == "__end__":
        return END
    return node_name


def build_graph():
    runtime_state = create_initial_run_state(
        graph_id=GRAPH.graph_id or "exported_graph",
        graph_name=GRAPH.name,
        max_revision_round=int(GRAPH.metadata.get("max_revision_round", 1)),
    )
    initialize_graph_state(GRAPH, runtime_state)

    if not RUNTIME_NODES and not BUILD_PLAN.runtime_condition_routes:
        return None

    workflow = StateGraph(_build_state_schema())

    def make_node(node_name: str):
        node = GRAPH.nodes[node_name]

        def _call(current_values: dict[str, Any]) -> dict[str, Any]:
            runtime_state["state_values"] = {{
                **dict(runtime_state.get("state_values", {{}})),
                **dict(current_values or {{}}),
            }}
            input_values, _state_reads = collect_node_inputs(node, runtime_state)
            body = _execute_node(GRAPH, node_name, node, input_values, runtime_state)
            outputs = dict(body.get("outputs", {{}}))
            state_writes = apply_state_writes(node_name, node.writes, outputs, runtime_state)
            return {{write["state_key"]: write["value"] for write in state_writes}}

        return _call

    def make_router(route):
        conditional_edges_by_source = {{
            conditional_edge.source: conditional_edge
            for conditional_edge in GRAPH.conditional_edges
        }}

        def route_key_for_steps(selected_steps: list[tuple[str, str, str]]) -> str:
            for route_key, planned_steps in route.branch_paths.items():
                if [
                    (str(step.condition), str(step.branch), str(step.target))
                    for step in planned_steps
                ] == selected_steps:
                    return str(route_key)
            rendered_path = " -> ".join(
                f"{{condition_name}}.{{branch}}->{{target}}"
                for condition_name, branch, target in selected_steps
            )
            raise ValueError(f"Condition route path is not compiled into the LangGraph plan: {{rendered_path}}")

        def _route(current_values: dict[str, Any]) -> str:
            runtime_state["state_values"] = {{
                **dict(runtime_state.get("state_values", {{}})),
                **dict(current_values or {{}}),
            }}
            condition_name = str(route.condition)
            selected_steps: list[tuple[str, str, str]] = []
            visited_conditions: set[str] = set()

            while True:
                if condition_name in visited_conditions:
                    raise ValueError(f"Condition route contains a condition-only cycle at '{{condition_name}}'.")
                visited_conditions.add(condition_name)

                condition_node = GRAPH.nodes[condition_name]
                input_values, _state_reads = collect_node_inputs(condition_node, runtime_state)
                body = _execute_node(GRAPH, condition_name, condition_node, input_values, runtime_state)
                branch = str(body.get("selected_branch") or "").strip()
                if not branch:
                    raise ValueError(f"Condition node '{{condition_name}}' did not produce a selected branch.")

                conditional_edge = conditional_edges_by_source.get(condition_name)
                if conditional_edge is None:
                    raise ValueError(f"Condition node '{{condition_name}}' has no conditional edge mapping.")
                target = str(conditional_edge.branches.get(branch) or "")
                if not target:
                    raise ValueError(
                        f"Condition node '{{condition_name}}' selected branch '{{branch}}', but that branch has no target."
                    )

                selected_steps.append((condition_name, branch, target))
                target_node = GRAPH.nodes.get(target)
                if target_node is not None and target_node.kind == "condition":
                    condition_name = target
                    continue
                return route_key_for_steps(selected_steps)

        return _route

    for node_name in RUNTIME_NODES:
        workflow.add_node(node_name, make_node(node_name))

    for node_name in BUILD_PLAN.requirements.runtime_entry_nodes:
        workflow.add_edge(START, node_name)
    for edge in BUILD_PLAN.runtime_edges:
        workflow.add_edge(edge.source, edge.target)
    for route in BUILD_PLAN.runtime_condition_routes:
        workflow.add_conditional_edges(
            _runtime_graph_endpoint(route.source),
            make_router(route),
            path_map={{
                branch: _runtime_graph_endpoint(target)
                for branch, target in route.branches.items()
            }},
        )
    for node_name in BUILD_PLAN.requirements.runtime_terminal_nodes:
        workflow.add_edge(node_name, END)

    return workflow.compile(
        interrupt_after=INTERRUPT_AFTER or None,
    )


def invoke_graph(initial_state: dict[str, Any] | None = None) -> dict[str, Any]:
    compiled = build_graph()
    state_values = build_graph_state_values(
        GRAPH,
        initial_state,
        allow_input_state_overrides=True,
    )
    if compiled is None:
        return state_values
    return compiled.invoke(state_values)


if __name__ == "__main__":
    result = invoke_graph()
    print(result)
"""


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

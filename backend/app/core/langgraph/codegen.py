from __future__ import annotations

import json
from pprint import pformat
from typing import Any

from app.core.schemas.node_system import NodeSystemGraphDocument


def generate_langgraph_python_source(graph: NodeSystemGraphDocument) -> str:
    payload = graph.model_dump(mode="json", by_alias=True)
    payload["graph_id"] = payload.get("graph_id") or "exported_graph"
    interrupt_before = _normalize_interrupt_config(graph.metadata.get("interrupt_before") or graph.metadata.get("interruptBefore"))
    interrupt_after = _normalize_interrupt_config(graph.metadata.get("interrupt_after") or graph.metadata.get("interruptAfter"))
    payload_literal = pformat(payload, sort_dicts=False, width=100)
    interrupt_before_literal = pformat(interrupt_before, sort_dicts=False, width=100)
    interrupt_after_literal = pformat(interrupt_after, sort_dicts=False, width=100)

    return f"""from __future__ import annotations

from typing import Any, Annotated
from typing_extensions import TypedDict

from langgraph.graph import END, START, StateGraph

from app.core.langgraph.compiler import compile_graph_to_langgraph_plan
from app.core.runtime.node_system_executor import (
    _apply_state_writes,
    _collect_node_inputs,
    _execute_node,
    _initialize_graph_state,
)
from app.core.runtime.state import create_initial_run_state
from app.core.schemas.node_system import NodeSystemGraphDocument


GRAPH_PAYLOAD = {payload_literal}
GRAPH = NodeSystemGraphDocument.model_validate(GRAPH_PAYLOAD)
BUILD_PLAN = compile_graph_to_langgraph_plan(GRAPH)
RUNTIME_NODES = list(BUILD_PLAN.runtime_nodes)
INTERRUPT_BEFORE = [node_name for node_name in {interrupt_before_literal} if node_name in RUNTIME_NODES]
INTERRUPT_AFTER = [node_name for node_name in {interrupt_after_literal} if node_name in RUNTIME_NODES]


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
    _initialize_graph_state(GRAPH, runtime_state)

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
            input_values, _state_reads = _collect_node_inputs(node, runtime_state)
            body = _execute_node(GRAPH, node_name, node, input_values, runtime_state)
            outputs = dict(body.get("outputs", {{}}))
            _apply_state_writes(node_name, node.writes, outputs, runtime_state)
            return outputs

        return _call

    def make_router(route):
        condition_node = GRAPH.nodes[route.condition]

        def _route(current_values: dict[str, Any]) -> str:
            runtime_state["state_values"] = {{
                **dict(runtime_state.get("state_values", {{}})),
                **dict(current_values or {{}}),
            }}
            input_values, _state_reads = _collect_node_inputs(condition_node, runtime_state)
            body = _execute_node(GRAPH, route.condition, condition_node, input_values, runtime_state)
            branch = str(body.get("selected_branch") or "").strip()
            if not branch:
                raise ValueError(f"Condition node '{{route.condition}}' did not produce a selected branch.")
            return branch

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
        interrupt_before=INTERRUPT_BEFORE or None,
        interrupt_after=INTERRUPT_AFTER or None,
    )


def invoke_graph(initial_state: dict[str, Any] | None = None) -> dict[str, Any]:
    compiled = build_graph()
    state_values = dict(initial_state or {{}})
    for state_name, definition in GRAPH.state_schema.items():
        if state_name not in state_values:
            state_values[state_name] = definition.value
    if compiled is None:
        return state_values
    return compiled.invoke(state_values)


if __name__ == "__main__":
    result = invoke_graph()
    print(result)
"""


def _normalize_interrupt_config(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]

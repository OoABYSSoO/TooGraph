from __future__ import annotations

from typing import Annotated, Any

from langgraph.graph import END, START
from typing_extensions import TypedDict

from app.core.schemas.node_system import NodeSystemGraphDocument


def replace_reducer(_current: Any, update: Any) -> Any:
    return update


def build_after_breakpoint_passthrough_callable():
    def _call(_current_values: dict[str, Any]) -> dict[str, Any]:
        return {}

    return _call


def runtime_graph_endpoint(node_name: str) -> str:
    if node_name == "__start__":
        return START
    if node_name == "__end__":
        return END
    return node_name


def mark_input_boundaries_success(graph: NodeSystemGraphDocument, state: dict[str, Any]) -> None:
    node_status_map = state.setdefault("node_status_map", {})
    for node_name, node in graph.nodes.items():
        if node.kind == "input":
            node_status_map[node_name] = "success"


def build_langgraph_state_schema(graph: NodeSystemGraphDocument):
    annotations = {
        state_name: Annotated[Any, replace_reducer]
        for state_name in graph.state_schema
    }
    return TypedDict("GraphiteUILangGraphState", annotations, total=False)

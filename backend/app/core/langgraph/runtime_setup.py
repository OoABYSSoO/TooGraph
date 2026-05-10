from __future__ import annotations

from collections import defaultdict
from typing import Annotated, Any, Callable

from langgraph.graph import END, START
from typing_extensions import TypedDict

from app.core.runtime.state import create_initial_run_state, set_run_status, utc_now_iso
from app.core.runtime.state_io import initialize_graph_state
from app.core.schemas.node_system import NodeSystemGraphDocument

PRESERVED_RUNTIME_METADATA_KEYS = {
    "pending_subgraph_breakpoint",
    "pending_subgraph_resume_payload",
}


def replace_reducer(_current: Any, update: Any) -> Any:
    return update


def build_after_breakpoint_passthrough_callable():
    def _call(_current_values: dict[str, Any]) -> dict[str, Any]:
        return {}

    return _call


def build_after_breakpoint_node_map(
    interrupt_after: list[str] | None,
    *,
    runtime_nodes: set[str],
    after_breakpoint_node_name_func: Callable[[str], str],
) -> dict[str, str]:
    return {
        node_name: after_breakpoint_node_name_func(node_name)
        for node_name in (interrupt_after or [])
        if node_name in runtime_nodes
    }


def build_compiled_interrupt_before(
    after_breakpoint_nodes: dict[str, str],
) -> list[str] | None:
    compiled_interrupt_before = sorted(set(after_breakpoint_nodes.values()))
    return compiled_interrupt_before or None


def build_langgraph_execution_edge_indexes(
    execution_edges: list[Any],
) -> tuple[dict[str, list[Any]], dict[tuple[str, str | None, str], str]]:
    outgoing_edges_by_source: defaultdict[str, list[Any]] = defaultdict(list)
    conditional_edge_ids: dict[tuple[str, str | None, str], str] = {}
    for edge in execution_edges:
        outgoing_edges_by_source[edge.source].append(edge)
        if edge.kind == "conditional":
            conditional_edge_ids[(edge.source, edge.branch, edge.target)] = edge.id
    return dict(outgoing_edges_by_source), conditional_edge_ids


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


def prepare_langgraph_runtime_state(
    graph: NodeSystemGraphDocument,
    initial_state: dict[str, Any] | None,
    *,
    resume_from_checkpoint: bool,
    create_initial_run_state_func: Callable[..., dict[str, Any]] = create_initial_run_state,
    set_run_status_func: Callable[[dict[str, Any], str], None] = set_run_status,
    utc_now_iso_func: Callable[[], str] = utc_now_iso,
    initialize_graph_state_func: Callable[..., None] = initialize_graph_state,
    mark_input_boundaries_success_func: Callable[[NodeSystemGraphDocument, dict[str, Any]], None] = mark_input_boundaries_success,
) -> dict[str, Any]:
    state = initial_state or create_initial_run_state_func(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    set_run_status_func(state, "running")
    state["runtime_backend"] = "langgraph"
    state.setdefault("started_at", utc_now_iso_func())
    state.pop("loop_limit_exhaustion", None)
    if resume_from_checkpoint:
        node_status_map = dict(state.get("node_status_map") or {})
        state["node_status_map"] = {
            node_name: node_status_map.get(node_name, "idle")
            for node_name in graph.nodes
        }
    else:
        state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    previous_metadata = dict(state.get("metadata") or {})
    state["metadata"] = {
        **dict(graph.metadata),
        **{
            key: previous_metadata[key]
            for key in PRESERVED_RUNTIME_METADATA_KEYS
            if key in previous_metadata
        },
    }
    state["metadata"]["resolved_runtime_backend"] = "langgraph"
    initialize_graph_state_func(graph, state, preserve_existing_values=resume_from_checkpoint)
    mark_input_boundaries_success_func(graph, state)
    return state


def build_langgraph_state_schema(graph: NodeSystemGraphDocument):
    annotations = {
        state_name: Annotated[Any, replace_reducer]
        for state_name in graph.state_schema
    }
    return TypedDict("TooGraphLangGraphState", annotations, total=False)

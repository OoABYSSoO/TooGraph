from __future__ import annotations

from dataclasses import dataclass

from app.schemas.graph import EdgeType, GraphDocument, GraphEdge, GraphNode, NodeType


@dataclass
class WorkflowConfig:
    graph_id: str
    graph_name: str
    start_node_id: str
    nodes_by_id: dict[str, GraphNode]
    linear_edges: dict[str, str]
    conditional_edges: dict[str, dict[str, str]]


def parse_graph(graph: GraphDocument) -> WorkflowConfig:
    nodes_by_id = {node.id: node for node in graph.nodes}
    input_nodes = [node for node in graph.nodes if node.type == NodeType.INPUT]
    if len(input_nodes) != 1:
        raise ValueError("Graph must contain exactly one input node for execution.")

    linear_edges: dict[str, str] = {}
    conditional_edges: dict[str, dict[str, str]] = {}

    for edge in graph.edges:
        _register_edge(edge, nodes_by_id, linear_edges, conditional_edges)

    return WorkflowConfig(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        start_node_id=input_nodes[0].id,
        nodes_by_id=nodes_by_id,
        linear_edges=linear_edges,
        conditional_edges=conditional_edges,
    )


def _register_edge(
    edge: GraphEdge,
    nodes_by_id: dict[str, GraphNode],
    linear_edges: dict[str, str],
    conditional_edges: dict[str, dict[str, str]],
) -> None:
    source_node = nodes_by_id[edge.source]

    if edge.type == EdgeType.NORMAL:
        if source_node.type == NodeType.EVALUATOR:
            raise ValueError("Evaluator nodes must use conditional edges.")
        if edge.source in linear_edges:
            raise ValueError(f"Node '{edge.source}' has multiple normal outgoing edges.")
        linear_edges[edge.source] = edge.target
        return

    conditional_targets = conditional_edges.setdefault(edge.source, {})
    label = edge.condition_label.value if edge.condition_label else ""
    if label in conditional_targets:
        raise ValueError(f"Node '{edge.source}' has duplicate '{label}' conditional edges.")
    conditional_targets[label] = edge.target


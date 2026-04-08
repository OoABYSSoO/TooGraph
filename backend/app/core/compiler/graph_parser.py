from __future__ import annotations

from dataclasses import dataclass

from app.core.schemas.graph import EdgeKind, GraphDocument, GraphEdge, GraphNode, NodeType, StateField, ThemeConfig


@dataclass
class WorkflowConfig:
    graph_id: str
    graph_name: str
    start_node_id: str
    end_node_id: str
    nodes_by_id: dict[str, GraphNode]
    edges_by_id: dict[str, GraphEdge]
    normal_edges: dict[str, list[str]]
    branch_edges: dict[str, dict[str, str]]
    state_schema: list[StateField]
    theme_config: ThemeConfig


def parse_graph(graph: GraphDocument) -> WorkflowConfig:
    nodes_by_id = {node.id: node for node in graph.nodes}
    start_nodes = [node for node in graph.nodes if node.type == NodeType.START]
    end_nodes = [node for node in graph.nodes if node.type == NodeType.END]
    if len(start_nodes) != 1:
        raise ValueError("Graph must contain exactly one start node.")
    if len(end_nodes) != 1:
        raise ValueError("Graph must contain exactly one end node.")

    edges_by_id = {edge.id: edge for edge in graph.edges}
    normal_edges: dict[str, list[str]] = {}
    branch_edges: dict[str, dict[str, str]] = {}

    for edge in graph.edges:
        _register_edge(edge, nodes_by_id, normal_edges, branch_edges)

    return WorkflowConfig(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        start_node_id=start_nodes[0].id,
        end_node_id=end_nodes[0].id,
        nodes_by_id=nodes_by_id,
        edges_by_id=edges_by_id,
        normal_edges=normal_edges,
        branch_edges=branch_edges,
        state_schema=graph.state_schema,
        theme_config=graph.theme_config,
    )


def _register_edge(
    edge: GraphEdge,
    nodes_by_id: dict[str, GraphNode],
    normal_edges: dict[str, list[str]],
    branch_edges: dict[str, dict[str, str]],
) -> None:
    source_node = nodes_by_id.get(edge.source)
    if source_node is None:
        return

    if edge.edge_kind == EdgeKind.NORMAL:
        normal_edges.setdefault(edge.source, []).append(edge.target)
        return

    conditional_targets = branch_edges.setdefault(edge.source, {})
    label = edge.branch_label.value if edge.branch_label else ""
    if label in conditional_targets:
        raise ValueError(f"Node '{edge.source}' has duplicate '{label}' conditional edges.")
    conditional_targets[label] = edge.target

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from app.core.schemas.node_system import NodeSystemGraphDocument


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


def build_execution_edges(graph: NodeSystemGraphDocument) -> list[ExecutionEdge]:
    execution_edges: list[ExecutionEdge] = []
    for edge in graph.edges:
        execution_edges.append(
            ExecutionEdge(
                id=build_regular_edge_id(edge.source, edge.target),
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
                    id=build_conditional_edge_id(conditional_edge.source, branch, target),
                    source=conditional_edge.source,
                    target=target,
                    kind="conditional",
                    branch=branch,
                )
            )
    return execution_edges


def select_active_outgoing_edges(outgoing_edges: list[ExecutionEdge], body: dict[str, Any]) -> set[str]:
    selected_branch = body.get("selected_branch")
    active_edges: set[str] = set()
    for edge in outgoing_edges:
        if edge.kind == "conditional":
            if selected_branch and edge.branch == selected_branch:
                active_edges.add(edge.id)
            continue
        active_edges.add(edge.id)
    return active_edges


def build_regular_edge_id(source: str, target: str) -> str:
    return f"edge:{source}:{target}"


def build_conditional_edge_id(source: str, branch: str, target: str) -> str:
    return f"conditional:{source}:{branch}->{target}"

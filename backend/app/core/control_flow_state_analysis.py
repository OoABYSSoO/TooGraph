from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemGraphPayload

GraphLike: TypeAlias = NodeSystemGraphDocument | NodeSystemGraphPayload


@dataclass(frozen=True)
class AmbiguousStateRead:
    node_id: str
    state_key: str


def find_ambiguous_state_reads(graph: GraphLike) -> list[AmbiguousStateRead]:
    successors = _build_successor_map(graph)
    reachability = {node_id: _collect_reachable_nodes(node_id, successors) for node_id in graph.nodes.keys()}
    writers_by_state: dict[str, list[str]] = {}

    for node_id, node in graph.nodes.items():
        for binding in node.writes:
            writers_by_state.setdefault(binding.state, []).append(node_id)

    ambiguous_reads: list[AmbiguousStateRead] = []
    for node_id, node in graph.nodes.items():
        for binding in node.reads:
            reachable_writers = [
                writer_id
                for writer_id in writers_by_state.get(binding.state, [])
                if writer_id != node_id and node_id in reachability.get(writer_id, set())
            ]
            if _has_unordered_writer_pair(reachable_writers, reachability):
                ambiguous_reads.append(AmbiguousStateRead(node_id=node_id, state_key=binding.state))

    return ambiguous_reads


def _build_successor_map(graph: GraphLike) -> dict[str, list[str]]:
    successor_map = {node_id: [] for node_id in graph.nodes.keys()}

    for edge in graph.edges:
        successor_map.setdefault(edge.source, []).append(edge.target)

    for conditional_edge in graph.conditional_edges:
        for target in conditional_edge.branches.values():
            successor_map.setdefault(conditional_edge.source, []).append(target)

    return successor_map


def _collect_reachable_nodes(start: str, successors: dict[str, list[str]]) -> set[str]:
    visited: set[str] = set()
    stack = list(successors.get(start, []))

    while stack:
        node_id = stack.pop()
        if node_id in visited:
            continue
        visited.add(node_id)
        stack.extend(successors.get(node_id, []))

    return visited


def _has_unordered_writer_pair(writer_ids: list[str], reachability: dict[str, set[str]]) -> bool:
    for index, left in enumerate(writer_ids):
        for right in writer_ids[index + 1 :]:
            left_reaches_right = right in reachability.get(left, set())
            right_reaches_left = left in reachability.get(right, set())
            if not left_reaches_right and not right_reaches_left:
                return True
    return False

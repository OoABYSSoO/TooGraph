from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemGraphPayload

GraphLike: TypeAlias = NodeSystemGraphDocument | NodeSystemGraphPayload
BranchPathSignature: TypeAlias = frozenset[tuple[str, str]]


@dataclass(frozen=True)
class AmbiguousStateRead:
    node_id: str
    state_key: str


def find_ambiguous_state_reads(graph: GraphLike) -> list[AmbiguousStateRead]:
    successors = _build_successor_map(graph)
    reachability = {node_id: _collect_reachable_nodes(node_id, successors) for node_id in graph.nodes.keys()}
    branch_path_signatures = _collect_branch_path_signatures(graph)
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
            if _has_unordered_writer_pair(reachable_writers, reachability, branch_path_signatures):
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


def _has_unordered_writer_pair(
    writer_ids: list[str],
    reachability: dict[str, set[str]],
    branch_path_signatures: dict[str, set[BranchPathSignature]],
) -> bool:
    for index, left in enumerate(writer_ids):
        for right in writer_ids[index + 1 :]:
            left_reaches_right = right in reachability.get(left, set())
            right_reaches_left = left in reachability.get(right, set())
            if (
                not left_reaches_right
                and not right_reaches_left
                and not _are_mutually_exclusive_branch_writers(left, right, branch_path_signatures)
            ):
                return True
    return False


def _collect_branch_path_signatures(graph: GraphLike) -> dict[str, set[BranchPathSignature]]:
    successors = _build_control_successor_map(graph)
    incoming_counts = {node_id: 0 for node_id in graph.nodes.keys()}
    for transitions in successors.values():
        for target, _, _ in transitions:
            if target in incoming_counts:
                incoming_counts[target] += 1

    entry_nodes = [node_id for node_id, count in incoming_counts.items() if count == 0] or list(graph.nodes.keys())
    signatures_by_node: dict[str, set[BranchPathSignature]] = {node_id: set() for node_id in graph.nodes.keys()}
    stack: list[tuple[str, BranchPathSignature, frozenset[str]]] = [
        (entry_node, frozenset(), frozenset({entry_node})) for entry_node in entry_nodes
    ]

    while stack:
        node_id, signature, visited = stack.pop()
        node_signatures = signatures_by_node.setdefault(node_id, set())
        if signature in node_signatures:
            continue
        node_signatures.add(signature)

        for target, condition_source, branch in successors.get(node_id, []):
            if target in visited:
                continue
            next_signature = signature
            if condition_source is not None and branch is not None:
                next_signature = frozenset((*signature, (condition_source, branch)))
            stack.append((target, next_signature, frozenset((*visited, target))))

    return signatures_by_node


def _build_control_successor_map(graph: GraphLike) -> dict[str, list[tuple[str, str | None, str | None]]]:
    successor_map = {node_id: [] for node_id in graph.nodes.keys()}

    for edge in graph.edges:
        successor_map.setdefault(edge.source, []).append((edge.target, None, None))

    for conditional_edge in graph.conditional_edges:
        for branch, target in conditional_edge.branches.items():
            successor_map.setdefault(conditional_edge.source, []).append((target, conditional_edge.source, branch))

    return successor_map


def _are_mutually_exclusive_branch_writers(
    left: str,
    right: str,
    branch_path_signatures: dict[str, set[BranchPathSignature]],
) -> bool:
    left_signatures = branch_path_signatures.get(left, set())
    right_signatures = branch_path_signatures.get(right, set())
    if not left_signatures or not right_signatures:
        return False
    return all(
        not _branch_path_signatures_are_compatible(left_signature, right_signature)
        for left_signature in left_signatures
        for right_signature in right_signatures
    )


def _branch_path_signatures_are_compatible(left: BranchPathSignature, right: BranchPathSignature) -> bool:
    selected_branches: dict[str, str] = {}
    for condition_source, branch in (*left, *right):
        selected_branch = selected_branches.get(condition_source)
        if selected_branch is not None and selected_branch != branch:
            return False
        selected_branches[condition_source] = branch
    return True

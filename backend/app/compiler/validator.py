from __future__ import annotations

from collections import Counter, defaultdict

from app.schemas.graph import (
    ConditionLabel,
    EdgeType,
    GraphDocument,
    GraphValidationResponse,
    NodeType,
    ValidationIssue,
)


REQUIRED_NODE_TYPES = {
    NodeType.INPUT,
    NodeType.PLANNER,
    NodeType.EVALUATOR,
    NodeType.FINALIZER,
}


def validate_graph(graph: GraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []

    node_ids = [node.id for node in graph.nodes]
    edge_ids = [edge.id for edge in graph.edges]
    node_id_set = set(node_ids)
    edge_id_set = set(edge_ids)

    issues.extend(_find_duplicate_ids(node_ids, "node"))
    issues.extend(_find_duplicate_ids(edge_ids, "edge"))

    node_type_counts = Counter(node.type for node in graph.nodes)
    for node_type in REQUIRED_NODE_TYPES:
        if node_type_counts[node_type] == 0:
            issues.append(
                ValidationIssue(
                    code="missing_required_node_type",
                    message=f"Graph must include at least one '{node_type.value}' node.",
                    path="nodes",
                )
            )

    input_nodes = [node for node in graph.nodes if node.type == NodeType.INPUT]
    if len(input_nodes) != 1:
        issues.append(
            ValidationIssue(
                code="invalid_input_node_count",
                message="Graph must include exactly one input node.",
                path="nodes",
            )
        )

    finalizer_nodes = [node for node in graph.nodes if node.type == NodeType.FINALIZER]
    if len(finalizer_nodes) != 1:
        issues.append(
            ValidationIssue(
                code="invalid_finalizer_node_count",
                message="Graph must include exactly one finalizer node.",
                path="nodes",
            )
        )

    outgoing_by_source: dict[str, list[str]] = defaultdict(list)
    incoming_by_target: dict[str, list[str]] = defaultdict(list)
    conditional_by_source: dict[str, set[ConditionLabel]] = defaultdict(set)

    for edge in graph.edges:
        if edge.source not in node_id_set:
            issues.append(
                ValidationIssue(
                    code="edge_source_missing",
                    message=f"Edge '{edge.id}' references missing source node '{edge.source}'.",
                    path=f"edges.{edge.id}.source",
                )
            )
        if edge.target not in node_id_set:
            issues.append(
                ValidationIssue(
                    code="edge_target_missing",
                    message=f"Edge '{edge.id}' references missing target node '{edge.target}'.",
                    path=f"edges.{edge.id}.target",
                )
            )

        if edge.source in node_id_set and edge.target in node_id_set:
            outgoing_by_source[edge.source].append(edge.id)
            incoming_by_target[edge.target].append(edge.id)

        if edge.type == EdgeType.CONDITIONAL:
            conditional_by_source[edge.source].add(edge.condition_label)

            source_node = next((node for node in graph.nodes if node.id == edge.source), None)
            if source_node and source_node.type != NodeType.EVALUATOR:
                issues.append(
                    ValidationIssue(
                        code="conditional_edge_invalid_source",
                        message="Conditional edges may only originate from evaluator nodes.",
                        path=f"edges.{edge.id}",
                    )
                )

    for node in graph.nodes:
        if node.type != NodeType.FINALIZER and len(outgoing_by_source[node.id]) == 0:
            issues.append(
                ValidationIssue(
                    code="node_missing_outgoing_edge",
                    message=f"Node '{node.id}' must have at least one outgoing edge.",
                    path=f"nodes.{node.id}",
                )
            )
        if node.type != NodeType.INPUT and len(incoming_by_target[node.id]) == 0:
            issues.append(
                ValidationIssue(
                    code="node_missing_incoming_edge",
                    message=f"Node '{node.id}' must have at least one incoming edge.",
                    path=f"nodes.{node.id}",
                )
            )

        if node.type == NodeType.EVALUATOR:
            labels = conditional_by_source.get(node.id, set())
            if not labels:
                issues.append(
                    ValidationIssue(
                        code="evaluator_missing_conditional_edges",
                        message=f"Evaluator node '{node.id}' must define conditional edges.",
                        path=f"nodes.{node.id}",
                    )
                )
            elif ConditionLabel.PASS not in labels:
                issues.append(
                    ValidationIssue(
                        code="evaluator_missing_pass_route",
                        message=f"Evaluator node '{node.id}' must define a 'pass' route.",
                        path=f"nodes.{node.id}",
                    )
                )

    if graph.edges and not edge_id_set:
        issues.append(
            ValidationIssue(
                code="edge_registration_failure",
                message="Graph edges could not be indexed correctly.",
                path="edges",
            )
        )

    return GraphValidationResponse(valid=len(issues) == 0, issues=issues)


def _find_duplicate_ids(ids: list[str], resource_name: str) -> list[ValidationIssue]:
    duplicates = [item_id for item_id, count in Counter(ids).items() if count > 1]
    return [
        ValidationIssue(
            code=f"duplicate_{resource_name}_id",
            message=f"Duplicate {resource_name} id '{item_id}' detected.",
            path=f"{resource_name}s",
        )
        for item_id in duplicates
    ]


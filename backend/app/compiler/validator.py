from __future__ import annotations

from collections import Counter, defaultdict

from app.schemas.graph import (
    ConditionLabel,
    EdgeKind,
    GraphDocument,
    GraphValidationResponse,
    NodeType,
    StateField,
    ValidationIssue,
)


def validate_graph(graph: GraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []

    node_ids = [node.id for node in graph.nodes]
    edge_ids = [edge.id for edge in graph.edges]
    node_id_set = set(node_ids)

    issues.extend(_find_duplicate_ids(node_ids, "node"))
    issues.extend(_find_duplicate_ids(edge_ids, "edge"))
    issues.extend(_find_duplicate_state_fields(graph.state_schema))

    start_nodes = [node for node in graph.nodes if node.type == NodeType.START]
    end_nodes = [node for node in graph.nodes if node.type == NodeType.END]
    if len(start_nodes) != 1:
        issues.append(
            ValidationIssue(
                code="invalid_start_node_count",
                message="Graph must include exactly one start node.",
                path="nodes",
            )
        )
    if len(end_nodes) != 1:
        issues.append(
            ValidationIssue(
                code="invalid_end_node_count",
                message="Graph must include exactly one end node.",
                path="nodes",
            )
        )

    outgoing_by_source: dict[str, list[str]] = defaultdict(list)
    incoming_by_target: dict[str, list[str]] = defaultdict(list)
    conditional_by_source: dict[str, set[ConditionLabel]] = defaultdict(set)
    normal_outgoing_by_source: dict[str, list[str]] = defaultdict(list)
    state_field_keys = {field.key for field in graph.state_schema}
    writes_by_node = {node.id: set(node.writes) for node in graph.nodes}

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
            if edge.edge_kind == EdgeKind.NORMAL:
                normal_outgoing_by_source[edge.source].append(edge.id)

        if edge.edge_kind == EdgeKind.BRANCH:
            conditional_by_source[edge.source].add(edge.branch_label)

            source_node = next((node for node in graph.nodes if node.id == edge.source), None)
            if source_node and source_node.type != NodeType.CONDITION:
                issues.append(
                    ValidationIssue(
                        code="branch_edge_invalid_source",
                        message="Branch edges may only originate from condition nodes.",
                        path=f"edges.{edge.id}",
                    )
                )

        source_writes = writes_by_node.get(edge.source, set())
        for flow_key in edge.flow_keys:
            if flow_key not in source_writes and flow_key not in state_field_keys:
                issues.append(
                    ValidationIssue(
                        code="edge_flow_key_unknown",
                        message=f"Edge '{edge.id}' uses unknown flow key '{flow_key}'.",
                        path=f"edges.{edge.id}.flow_keys",
                    )
                )

    for node in graph.nodes:
        if node.type != NodeType.END and len(outgoing_by_source[node.id]) == 0:
            issues.append(
                ValidationIssue(
                    code="node_missing_outgoing_edge",
                    message=f"Node '{node.id}' must have at least one outgoing edge.",
                    path=f"nodes.{node.id}",
                )
            )
        if node.type != NodeType.START and len(incoming_by_target[node.id]) == 0:
            issues.append(
                ValidationIssue(
                    code="node_missing_incoming_edge",
                    message=f"Node '{node.id}' must have at least one incoming edge.",
                    path=f"nodes.{node.id}",
                )
            )

        for read_key in node.reads:
            if read_key not in state_field_keys:
                issues.append(
                    ValidationIssue(
                        code="node_read_key_unknown",
                        message=f"Node '{node.id}' reads undefined state key '{read_key}'.",
                        path=f"nodes.{node.id}.reads",
                    )
                )
        for write_key in node.writes:
            if write_key not in state_field_keys:
                issues.append(
                    ValidationIssue(
                        code="node_write_key_unknown",
                        message=f"Node '{node.id}' writes undefined state key '{write_key}'.",
                        path=f"nodes.{node.id}.writes",
                    )
                )

        if node.type == NodeType.CONDITION:
            labels = conditional_by_source.get(node.id, set())
            if len(labels) < 2:
                issues.append(
                    ValidationIssue(
                        code="condition_missing_branch_edges",
                        message=f"Condition node '{node.id}' must define at least two branch edges.",
                        path=f"nodes.{node.id}",
                    )
                )
            elif ConditionLabel.PASS not in labels:
                issues.append(
                    ValidationIssue(
                        code="condition_missing_pass_route",
                        message=f"Condition node '{node.id}' must define a 'pass' route.",
                        path=f"nodes.{node.id}",
                    )
                )
        elif len(normal_outgoing_by_source[node.id]) > 1:
            issues.append(
                ValidationIssue(
                    code="multiple_normal_outgoing_edges_not_supported",
                    message=(
                        f"Node '{node.id}' has multiple normal outgoing edges. "
                        "Current standard runtime requires a single normal successor; use a condition node for branching."
                    ),
                    path=f"nodes.{node.id}",
                )
            )

    issues.extend(_validate_business_dependencies(graph))

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


def _find_duplicate_state_fields(state_schema: list[StateField]) -> list[ValidationIssue]:
    field_keys = [field.key for field in state_schema]
    duplicates = [item_key for item_key, count in Counter(field_keys).items() if count > 1]
    return [
        ValidationIssue(
            code="duplicate_state_field_key",
            message=f"Duplicate state field key '{item_key}' detected.",
            path="state_schema",
        )
        for item_key in duplicates
    ]


def _validate_business_dependencies(graph: GraphDocument) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    node_types = {node.type for node in graph.nodes}

    if NodeType.REVIEW_VARIANTS in node_types and NodeType.GENERATE_VARIANTS not in node_types:
        issues.append(
            ValidationIssue(
                code="missing_generate_variants_before_review",
                message="Graphs with review_variants must include generate_variants.",
                path="nodes",
            )
        )

    if NodeType.PREPARE_VIDEO_TODO in node_types and NodeType.GENERATE_VIDEO_PROMPTS not in node_types:
        issues.append(
            ValidationIssue(
                code="missing_video_prompt_generation",
                message="Graphs with prepare_video_todo must include generate_video_prompts.",
                path="nodes",
            )
        )

    return issues

from __future__ import annotations

from collections import Counter

from app.core.schemas.node_system import (
    GraphValidationResponse,
    NodeSystemGraphDocument,
    StateField,
    ValidationIssue,
)


def validate_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    return _validate_node_system_graph(graph)


def _validate_node_system_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []

    node_ids = [node.id for node in graph.nodes]
    edge_ids = [edge.id for edge in graph.edges]
    node_id_set = set(node_ids)

    issues.extend(_find_duplicate_ids(node_ids, "node"))
    issues.extend(_find_duplicate_ids(edge_ids, "edge"))
    issues.extend(_find_duplicate_state_fields(graph.state_schema))

    for node in graph.nodes:
        config = node.data.config
        if config.family == "agent":
            output_keys = {output.key for output in config.outputs}
            for output_key in config.output_binding:
                if output_key not in output_keys:
                    issues.append(
                        ValidationIssue(
                            code="agent_output_binding_unknown_key",
                            message=(
                                f"Agent node '{node.id}' binds output key '{output_key}' "
                                "but the key does not exist in outputs."
                            ),
                            path=f"nodes.{node.id}.data.config.outputBinding",
                        )
                    )
        elif config.family == "condition":
            branch_keys = {branch.key for branch in config.branches}
            if len(branch_keys) < 2:
                issues.append(
                    ValidationIssue(
                        code="condition_branch_count_too_small",
                        message=f"Condition node '{node.id}' must define at least two branches.",
                        path=f"nodes.{node.id}.data.config.branches",
                    )
                )
            for mapped_branch in config.branch_mapping.values():
                if mapped_branch not in branch_keys:
                    issues.append(
                        ValidationIssue(
                            code="condition_branch_mapping_unknown_target",
                            message=(
                                f"Condition node '{node.id}' maps to unknown branch "
                                f"'{mapped_branch}'."
                            ),
                            path=f"nodes.{node.id}.data.config.branchMapping",
                        )
                    )

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

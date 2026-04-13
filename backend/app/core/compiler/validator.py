from __future__ import annotations

from collections import Counter, defaultdict

from app.core.schemas.node_system import (
    AgentNodeConfig,
    ConditionNodeConfig,
    GraphValidationResponse,
    InputBoundaryNodeConfig,
    NodeSystemGraphDocument,
    OutputBoundaryNodeConfig,
    StateField,
    ValidationIssue,
)
from app.skills.registry import get_skill_registry


def validate_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    return _validate_node_system_graph(graph)


def _validate_node_system_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []
    runtime_skill_keys = set(get_skill_registry().keys())

    node_ids = [node.id for node in graph.nodes]
    edge_ids = [edge.id for edge in graph.edges]
    node_id_set = set(node_ids)
    state_key_set = {field.key for field in graph.state_schema}
    incoming_edge_targets_by_node: dict[str, set[str]] = defaultdict(set)
    incoming_edge_handle_counts: dict[tuple[str, str], int] = defaultdict(int)

    issues.extend(_find_duplicate_ids(node_ids, "node"))
    issues.extend(_find_duplicate_ids(edge_ids, "edge"))
    issues.extend(_find_duplicate_state_fields(graph.state_schema))

    for edge in graph.edges:
        if edge.target_handle:
            incoming_edge_targets_by_node[edge.target].add(edge.target_handle.split(":", 1)[-1])
            incoming_edge_handle_counts[(edge.target, edge.target_handle.split(":", 1)[-1])] += 1

    for (target_node_id, target_key), count in incoming_edge_handle_counts.items():
        if count > 1:
            issues.append(
                ValidationIssue(
                    code="duplicate_incoming_target_handle",
                    message=(
                        f"Node '{target_node_id}' input '{target_key}' is targeted by more than one edge. "
                        "Use a single incoming edge per input."
                    ),
                    path=f"nodes.{target_node_id}.edges",
                )
            )

    for node in graph.nodes:
        config = node.data.config
        input_keys = _input_keys_for_config(config)
        output_keys = _output_keys_for_config(config)
        issues.extend(_find_invalid_state_bindings(node.id, config, state_key_set, input_keys, output_keys, incoming_edge_targets_by_node.get(node.id, set())))

        if config.family == "agent":
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
            for index, skill in enumerate(config.skills):
                if skill.skill_key not in runtime_skill_keys:
                    issues.append(
                        ValidationIssue(
                            code="agent_skill_not_runtime_registered",
                            message=(
                                f"Agent node '{node.id}' attaches skill '{skill.skill_key}', "
                                "but the skill is not runtime-registered."
                            ),
                            path=f"nodes.{node.id}.data.config.skills.{index}",
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


def _input_keys_for_config(config: InputBoundaryNodeConfig | AgentNodeConfig | ConditionNodeConfig | OutputBoundaryNodeConfig) -> set[str]:
    if isinstance(config, AgentNodeConfig | ConditionNodeConfig):
        return {port.key for port in config.inputs}
    if isinstance(config, OutputBoundaryNodeConfig):
        return {config.input.key}
    return set()


def _output_keys_for_config(config: InputBoundaryNodeConfig | AgentNodeConfig | ConditionNodeConfig | OutputBoundaryNodeConfig) -> set[str]:
    if isinstance(config, InputBoundaryNodeConfig):
        return {config.output.key}
    if isinstance(config, AgentNodeConfig):
        return {port.key for port in config.outputs}
    if isinstance(config, ConditionNodeConfig):
        return {branch.key for branch in config.branches}
    return {config.input.key}


def _find_invalid_state_bindings(
    node_id: str,
    config: InputBoundaryNodeConfig | AgentNodeConfig | ConditionNodeConfig | OutputBoundaryNodeConfig,
    state_key_set: set[str],
    input_keys: set[str],
    output_keys: set[str],
    incoming_edge_targets: set[str],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []

    read_input_keys = [binding.input_key for binding in config.state_reads]
    duplicate_read_inputs = [input_key for input_key, count in Counter(read_input_keys).items() if count > 1]
    for input_key in duplicate_read_inputs:
        issues.append(
            ValidationIssue(
                code="duplicate_state_read_input_key",
                message=f"Node '{node_id}' binds input '{input_key}' from state more than once.",
                path=f"nodes.{node_id}.data.config.stateReads",
            )
        )

    write_output_keys = [binding.output_key for binding in config.state_writes]
    duplicate_write_outputs = [output_key for output_key, count in Counter(write_output_keys).items() if count > 1]
    for output_key in duplicate_write_outputs:
        issues.append(
            ValidationIssue(
                code="duplicate_state_write_output_key",
                message=f"Node '{node_id}' writes output '{output_key}' into state more than once.",
                path=f"nodes.{node_id}.data.config.stateWrites",
            )
        )

    for index, binding in enumerate(config.state_reads):
        if binding.state_key not in state_key_set:
            issues.append(
                ValidationIssue(
                    code="state_read_unknown_state_key",
                    message=f"Node '{node_id}' reads unknown state '{binding.state_key}'.",
                    path=f"nodes.{node_id}.data.config.stateReads.{index}.stateKey",
                )
            )
        if binding.input_key not in input_keys:
            issues.append(
                ValidationIssue(
                    code="state_read_unknown_input_key",
                    message=f"Node '{node_id}' reads state into unknown input '{binding.input_key}'.",
                    path=f"nodes.{node_id}.data.config.stateReads.{index}.inputKey",
                )
            )
        if binding.input_key in incoming_edge_targets:
            issues.append(
                ValidationIssue(
                    code="state_read_edge_conflict",
                    message=(
                        f"Node '{node_id}' input '{binding.input_key}' is bound by both an edge "
                        f"and state '{binding.state_key}'."
                    ),
                    path=f"nodes.{node_id}.data.config.stateReads.{index}",
                )
            )

    for index, binding in enumerate(config.state_writes):
        if binding.state_key not in state_key_set:
            issues.append(
                ValidationIssue(
                    code="state_write_unknown_state_key",
                    message=f"Node '{node_id}' writes unknown state '{binding.state_key}'.",
                    path=f"nodes.{node_id}.data.config.stateWrites.{index}.stateKey",
                )
            )
        if binding.output_key not in output_keys:
            issues.append(
                ValidationIssue(
                    code="state_write_unknown_output_key",
                    message=f"Node '{node_id}' writes unknown output '{binding.output_key}' into state.",
                    path=f"nodes.{node_id}.data.config.stateWrites.{index}.outputKey",
                )
            )

    return issues

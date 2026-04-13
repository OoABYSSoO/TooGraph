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
    ValueType,
)
from app.skills.registry import get_skill_registry

KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base"


def validate_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    return _validate_node_system_graph(graph)


def _validate_node_system_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []
    runtime_skill_keys = set(get_skill_registry().keys())

    node_ids = [node.id for node in graph.nodes]
    edge_ids = [edge.id for edge in graph.edges]
    node_id_set = set(node_ids)
    nodes_by_id = {node.id: node for node in graph.nodes}
    state_key_set = {field.key for field in graph.state_schema}
    incoming_edge_targets_by_node: dict[str, set[str]] = defaultdict(set)
    incoming_edge_handle_counts: dict[tuple[str, str], int] = defaultdict(int)
    incoming_knowledge_base_inputs_by_agent: dict[str, set[str]] = defaultdict(set)

    issues.extend(_find_duplicate_ids(node_ids, "node"))
    issues.extend(_find_duplicate_ids(edge_ids, "edge"))
    issues.extend(_find_duplicate_state_fields(graph.state_schema))

    for edge in graph.edges:
        if edge.target_handle:
            incoming_edge_targets_by_node[edge.target].add(edge.target_handle.split(":", 1)[-1])
            incoming_edge_handle_counts[(edge.target, edge.target_handle.split(":", 1)[-1])] += 1
        source_node = nodes_by_id.get(edge.source)
        target_node = nodes_by_id.get(edge.target)
        if not source_node or not target_node or target_node.data.config.family != "agent":
            continue
        target_key = _get_handle_key(edge.target_handle)
        if not target_key:
            continue
        source_type = _get_port_type(source_node.data.config, edge.source_handle)
        if source_type == ValueType.KNOWLEDGE_BASE:
            incoming_knowledge_base_inputs_by_agent[edge.target].add(target_key)

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
            knowledge_input_keys = sorted(incoming_knowledge_base_inputs_by_agent.get(node.id, set()))
            if len(knowledge_input_keys) > 1:
                issues.append(
                    ValidationIssue(
                        code="agent_multiple_knowledge_base_inputs",
                        message=(
                            f"Agent node '{node.id}' is connected to more than one knowledge base input. "
                            "Use a single knowledge base binding per agent."
                        ),
                        path=f"nodes.{node.id}.edges",
                    )
                )
            knowledge_skill_indices = [index for index, skill in enumerate(config.skills) if skill.skill_key == KNOWLEDGE_BASE_SKILL_KEY]
            if knowledge_input_keys:
                knowledge_input_key = knowledge_input_keys[0]
                query_input_key = _pick_agent_knowledge_query_input_key(config, knowledge_input_key)
                if not query_input_key:
                    issues.append(
                        ValidationIssue(
                            code="agent_knowledge_query_input_missing",
                            message=(
                                f"Agent node '{node.id}' receives a knowledge base, but no non-knowledge input is available "
                                "to drive the knowledge search query."
                            ),
                            path=f"nodes.{node.id}.data.config.inputs",
                        )
                    )
                if len(knowledge_skill_indices) != 1:
                    issues.append(
                        ValidationIssue(
                            code="agent_knowledge_skill_missing",
                            message=(
                                f"Agent node '{node.id}' receives a knowledge base, but must attach exactly one "
                                f"'{KNOWLEDGE_BASE_SKILL_KEY}' skill."
                            ),
                            path=f"nodes.{node.id}.data.config.skills",
                        )
                    )
                else:
                    knowledge_skill = config.skills[knowledge_skill_indices[0]]
                    expected_knowledge_ref = f"$inputs.{knowledge_input_key}"
                    if knowledge_skill.input_mapping.get("knowledge_base") != expected_knowledge_ref:
                        issues.append(
                            ValidationIssue(
                                code="agent_knowledge_skill_input_mapping_invalid",
                                message=(
                                    f"Agent node '{node.id}' must bind '{KNOWLEDGE_BASE_SKILL_KEY}.knowledge_base' "
                                    f"to '{expected_knowledge_ref}'."
                                ),
                                path=f"nodes.{node.id}.data.config.skills.{knowledge_skill_indices[0]}.inputMapping.knowledge_base",
                            )
                        )
                    if query_input_key:
                        expected_query_ref = f"$inputs.{query_input_key}"
                        if knowledge_skill.input_mapping.get("query") != expected_query_ref:
                            issues.append(
                                ValidationIssue(
                                    code="agent_knowledge_skill_query_mapping_invalid",
                                    message=(
                                        f"Agent node '{node.id}' must bind '{KNOWLEDGE_BASE_SKILL_KEY}.query' "
                                        f"to '{expected_query_ref}'."
                                    ),
                                    path=f"nodes.{node.id}.data.config.skills.{knowledge_skill_indices[0]}.inputMapping.query",
                                )
                            )
            elif knowledge_skill_indices:
                issues.append(
                    ValidationIssue(
                        code="agent_knowledge_skill_without_binding",
                        message=(
                            f"Agent node '{node.id}' attaches '{KNOWLEDGE_BASE_SKILL_KEY}', but no knowledge base input "
                            "is connected."
                        ),
                        path=f"nodes.{node.id}.data.config.skills",
                    )
                )
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


def _get_handle_key(handle_id: str | None) -> str | None:
    if not handle_id:
        return None
    parts = handle_id.split(":", 1)
    return parts[1] if len(parts) > 1 else None


def _get_port_type(
    config: InputBoundaryNodeConfig | AgentNodeConfig | ConditionNodeConfig | OutputBoundaryNodeConfig,
    handle_id: str | None,
) -> ValueType | None:
    key = _get_handle_key(handle_id)
    if not key:
        return None
    if isinstance(config, InputBoundaryNodeConfig):
        return config.output.value_type if handle_id and handle_id.startswith("output:") and config.output.key == key else None
    if isinstance(config, OutputBoundaryNodeConfig):
        return config.input.value_type if handle_id and handle_id.startswith("input:") and config.input.key == key else None
    if isinstance(config, AgentNodeConfig):
        if handle_id and handle_id.startswith("input:"):
            matched_input = next((port for port in config.inputs if port.key == key), None)
            return matched_input.value_type if matched_input else None
        if handle_id and handle_id.startswith("output:"):
            matched_output = next((port for port in config.outputs if port.key == key), None)
            return matched_output.value_type if matched_output else None
    if isinstance(config, ConditionNodeConfig):
        if handle_id and handle_id.startswith("input:"):
            matched_input = next((port for port in config.inputs if port.key == key), None)
            return matched_input.value_type if matched_input else None
        if handle_id and handle_id.startswith("output:"):
            return ValueType.ANY
    return None


def _pick_agent_knowledge_query_input_key(config: AgentNodeConfig, knowledge_input_key: str) -> str | None:
    candidate_inputs = [
        port
        for port in config.inputs
        if port.key != knowledge_input_key and port.value_type != ValueType.KNOWLEDGE_BASE
    ]
    for preferred_key in ("question", "query", "input"):
        matched = next((port for port in candidate_inputs if port.key == preferred_key), None)
        if matched:
            return matched.key

    preferred_text_input = next(
        (port for port in candidate_inputs if port.required and port.value_type in {ValueType.TEXT, ValueType.ANY}),
        None,
    ) or next((port for port in candidate_inputs if port.value_type in {ValueType.TEXT, ValueType.ANY}), None)
    if preferred_text_input:
        return preferred_text_input.key

    required_input = next((port for port in candidate_inputs if port.required), None)
    return required_input.key if required_input else (candidate_inputs[0].key if candidate_inputs else None)


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

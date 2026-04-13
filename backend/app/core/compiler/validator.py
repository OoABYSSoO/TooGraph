from __future__ import annotations

from collections import Counter

from app.core.schemas.node_system import (
    GraphValidationResponse,
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemGraphDocument,
    NodeSystemGraphEdge,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemStateType,
    ValidationIssue,
)
from app.skills.registry import get_skill_registry

KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base"


def validate_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []
    runtime_skill_keys = set(get_skill_registry().keys())

    nodes_by_name = graph.nodes
    state_schema = graph.state_schema
    edge_counts = Counter(
        (
            edge.source,
            edge.target,
            edge.source_handle,
            edge.target_handle,
        )
        for edge in graph.edges
    )

    for edge_key, count in edge_counts.items():
        if count <= 1:
            continue
        source, target, source_handle, target_handle = edge_key
        issues.append(
            ValidationIssue(
                code="duplicate_edge",
                message=(
                    f"Duplicate edge '{source}.{source_handle} -> {target}.{target_handle}' detected. "
                    "Keep a single explicit connection."
                ),
                path="edges",
            )
        )

    incoming_target_handle_counts = Counter((edge.target, edge.target_handle) for edge in graph.edges)
    for (target, target_handle), count in incoming_target_handle_counts.items():
        if count > 1:
            issues.append(
                ValidationIssue(
                    code="duplicate_incoming_target_handle",
                    message=(
                        f"Node '{target}' input '{target_handle}' is targeted by more than one edge. "
                        "Use a single incoming edge per state reader."
                    ),
                    path="edges",
                )
            )

    for node_name, node in nodes_by_name.items():
        issues.extend(_validate_node_shape(node_name, node))
        if isinstance(node, NodeSystemAgentNode):
            issues.extend(_validate_agent_node(node_name, node, state_schema, runtime_skill_keys))
        elif isinstance(node, NodeSystemConditionNode):
            issues.extend(_validate_condition_node(node_name, node, graph))

    for index, edge in enumerate(graph.edges):
        issues.extend(_validate_edge(index, edge, graph))

    for index, conditional_edge in enumerate(graph.conditional_edges):
        issues.extend(_validate_conditional_edge(index, conditional_edge.source, conditional_edge.branches, graph))

    return GraphValidationResponse(valid=len(issues) == 0, issues=issues)


def _validate_node_shape(node_name: str, node: object) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    reads = getattr(node, "reads", [])
    writes = getattr(node, "writes", [])
    read_states = [binding.state for binding in reads]
    write_states = [binding.state for binding in writes]

    duplicate_reads = [state_name for state_name, count in Counter(read_states).items() if count > 1]
    duplicate_writes = [state_name for state_name, count in Counter(write_states).items() if count > 1]

    for state_name in duplicate_reads:
        issues.append(
            ValidationIssue(
                code="duplicate_node_read_state",
                message=f"Node '{node_name}' reads state '{state_name}' more than once.",
                path=f"nodes.{node_name}.reads",
            )
        )
    for state_name in duplicate_writes:
        issues.append(
            ValidationIssue(
                code="duplicate_node_write_state",
                message=f"Node '{node_name}' writes state '{state_name}' more than once.",
                path=f"nodes.{node_name}.writes",
            )
        )

    if isinstance(node, NodeSystemInputNode) and node.reads:
        issues.append(
            ValidationIssue(
                code="input_node_reads_not_allowed",
                message=f"Input node '{node_name}' cannot read graph state.",
                path=f"nodes.{node_name}.reads",
            )
        )
    if isinstance(node, NodeSystemInputNode) and len(node.writes) != 1:
        issues.append(
            ValidationIssue(
                code="input_node_write_count_invalid",
                message=f"Input node '{node_name}' must define exactly one written state.",
                path=f"nodes.{node_name}.writes",
            )
        )

    if isinstance(node, NodeSystemOutputNode) and node.writes:
        issues.append(
            ValidationIssue(
                code="output_node_writes_not_allowed",
                message=f"Output node '{node_name}' cannot write graph state.",
                path=f"nodes.{node_name}.writes",
            )
        )
    if isinstance(node, NodeSystemOutputNode) and len(node.reads) != 1:
        issues.append(
            ValidationIssue(
                code="output_node_read_count_invalid",
                message=f"Output node '{node_name}' must define exactly one read state.",
                path=f"nodes.{node_name}.reads",
            )
        )

    return issues


def _validate_agent_node(
    node_name: str,
    node: NodeSystemAgentNode,
    state_schema: dict[str, object],
    runtime_skill_keys: set[str],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    knowledge_reads = [
        binding.state
        for binding in node.reads
        if state_schema.get(binding.state) and state_schema[binding.state].type == NodeSystemStateType.KNOWLEDGE_BASE
    ]
    if len(knowledge_reads) > 1:
        issues.append(
            ValidationIssue(
                code="agent_multiple_knowledge_base_inputs",
                message=f"Agent node '{node_name}' can read at most one knowledge base state.",
                path=f"nodes.{node_name}.reads",
            )
        )

    for index, skill_key in enumerate(node.config.skills):
        if skill_key not in runtime_skill_keys:
            issues.append(
                ValidationIssue(
                    code="agent_skill_not_runtime_registered",
                    message=(
                        f"Agent node '{node_name}' attaches skill '{skill_key}', "
                        "but the skill is not runtime-registered."
                    ),
                    path=f"nodes.{node_name}.config.skills.{index}",
                )
            )

    knowledge_skill_count = sum(1 for skill_key in node.config.skills if skill_key == KNOWLEDGE_BASE_SKILL_KEY)
    if knowledge_reads:
        if knowledge_skill_count != 1:
            issues.append(
                ValidationIssue(
                    code="agent_knowledge_skill_missing",
                    message=(
                        f"Agent node '{node_name}' reads a knowledge base state, but must attach exactly one "
                        f"'{KNOWLEDGE_BASE_SKILL_KEY}' skill."
                    ),
                    path=f"nodes.{node_name}.config.skills",
                )
            )

        query_reads = [
            binding.state
            for binding in node.reads
            if binding.state not in knowledge_reads
            and state_schema.get(binding.state)
            and state_schema[binding.state].type in {NodeSystemStateType.TEXT, NodeSystemStateType.MARKDOWN}
        ]
        if not query_reads:
            issues.append(
                ValidationIssue(
                    code="agent_knowledge_query_input_missing",
                    message=(
                        f"Agent node '{node_name}' reads a knowledge base state, but has no text-like state to use as the query."
                    ),
                    path=f"nodes.{node_name}.reads",
                )
            )
    elif knowledge_skill_count:
        issues.append(
            ValidationIssue(
                code="agent_knowledge_skill_without_binding",
                message=(
                    f"Agent node '{node_name}' attaches '{KNOWLEDGE_BASE_SKILL_KEY}', but no knowledge base state is bound."
                ),
                path=f"nodes.{node_name}.config.skills",
            )
        )

    return issues


def _validate_condition_node(
    node_name: str,
    node: NodeSystemConditionNode,
    graph: NodeSystemGraphDocument,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if len(node.config.branches) < 2:
        issues.append(
            ValidationIssue(
                code="condition_branch_count_too_small",
                message=f"Condition node '{node_name}' must define at least two branches.",
                path=f"nodes.{node_name}.config.branches",
            )
        )

    conditional_edge = next((item for item in graph.conditional_edges if item.source == node_name), None)
    if conditional_edge is None:
        issues.append(
            ValidationIssue(
                code="condition_branch_targets_missing",
                message=f"Condition node '{node_name}' must define conditional_edges targets for every branch.",
                path="conditional_edges",
            )
        )
        return issues

    branch_names = set(node.config.branches)
    conditional_branch_names = set(conditional_edge.branches.keys())
    missing_branches = sorted(branch_names - conditional_branch_names)
    extra_branches = sorted(conditional_branch_names - branch_names)

    if missing_branches:
        issues.append(
            ValidationIssue(
                code="condition_branch_target_missing",
                message=(
                    f"Condition node '{node_name}' is missing targets for branches: {', '.join(missing_branches)}."
                ),
                path="conditional_edges",
            )
        )
    if extra_branches:
        issues.append(
            ValidationIssue(
                code="condition_branch_target_unknown",
                message=(
                    f"Condition node '{node_name}' defines unexpected conditional branches: {', '.join(extra_branches)}."
                ),
                path="conditional_edges",
            )
        )

    for mapping_key, branch_name in node.config.branch_mapping.items():
        if branch_name not in branch_names:
            issues.append(
                ValidationIssue(
                    code="condition_branch_mapping_unknown_target",
                    message=(
                        f"Condition node '{node_name}' maps '{mapping_key}' to unknown branch '{branch_name}'."
                    ),
                    path=f"nodes.{node_name}.config.branchMapping.{mapping_key}",
                )
            )

    return issues


def _validate_edge(index: int, edge: NodeSystemGraphEdge, graph: NodeSystemGraphDocument) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    source_node = graph.nodes.get(edge.source)
    target_node = graph.nodes.get(edge.target)

    if source_node is None:
        issues.append(
            ValidationIssue(
                code="edge_source_missing",
                message=f"Edge '{edge.sourceHandle}->{edge.targetHandle}' references missing source node '{edge.source}'.",
                path=f"edges.{index}.source",
            )
        )
        return issues
    if target_node is None:
        issues.append(
            ValidationIssue(
                code="edge_target_missing",
                message=f"Edge '{edge.sourceHandle}->{edge.targetHandle}' references missing target node '{edge.target}'.",
                path=f"edges.{index}.target",
            )
        )
        return issues

    source_kind, source_state = _parse_handle(edge.source_handle)
    target_kind, target_state = _parse_handle(edge.target_handle)

    if source_kind != "write":
        issues.append(
            ValidationIssue(
                code="edge_source_handle_invalid",
                message=f"Edge source handle '{edge.source_handle}' must reference a write handle.",
                path=f"edges.{index}.sourceHandle",
            )
        )
    if target_kind != "read":
        issues.append(
            ValidationIssue(
                code="edge_target_handle_invalid",
                message=f"Edge target handle '{edge.target_handle}' must reference a read handle.",
                path=f"edges.{index}.targetHandle",
            )
        )

    if source_state != target_state:
        issues.append(
            ValidationIssue(
                code="edge_state_mismatch",
                message=(
                    f"Edge '{edge.source}.{edge.source_handle} -> {edge.target}.{edge.target_handle}' must reference the same state."
                ),
                path=f"edges.{index}",
            )
        )

    if source_state and source_state not in {binding.state for binding in source_node.writes}:
        issues.append(
            ValidationIssue(
                code="edge_source_state_not_written",
                message=(
                    f"Node '{edge.source}' does not write state '{source_state}', so it cannot expose '{edge.source_handle}'."
                ),
                path=f"edges.{index}.sourceHandle",
            )
        )

    if target_state and target_state not in {binding.state for binding in target_node.reads}:
        issues.append(
            ValidationIssue(
                code="edge_target_state_not_read",
                message=(
                    f"Node '{edge.target}' does not read state '{target_state}', so it cannot accept '{edge.target_handle}'."
                ),
                path=f"edges.{index}.targetHandle",
            )
        )

    return issues


def _validate_conditional_edge(
    index: int,
    source: str,
    branches: dict[str, str],
    graph: NodeSystemGraphDocument,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    source_node = graph.nodes.get(source)
    if source_node is None:
        issues.append(
            ValidationIssue(
                code="conditional_edge_source_missing",
                message=f"Conditional edge references missing source node '{source}'.",
                path=f"conditional_edges.{index}.source",
            )
        )
        return issues

    if not isinstance(source_node, NodeSystemConditionNode):
        issues.append(
            ValidationIssue(
                code="conditional_edge_source_invalid",
                message=f"Conditional edge source '{source}' must be a condition node.",
                path=f"conditional_edges.{index}.source",
            )
        )
        return issues

    for branch, target in branches.items():
        if branch not in source_node.config.branches:
            issues.append(
                ValidationIssue(
                    code="conditional_edge_branch_unknown",
                    message=f"Condition node '{source}' does not define branch '{branch}'.",
                    path=f"conditional_edges.{index}.branches.{branch}",
                )
            )
        if target not in graph.nodes:
            issues.append(
                ValidationIssue(
                    code="conditional_edge_target_missing",
                    message=f"Conditional edge branch '{branch}' references missing target node '{target}'.",
                    path=f"conditional_edges.{index}.branches.{branch}",
                )
            )

    return issues


def _parse_handle(handle: str) -> tuple[str | None, str | None]:
    if ":" not in handle:
        return None, None
    prefix, state_name = handle.split(":", 1)
    return prefix, state_name

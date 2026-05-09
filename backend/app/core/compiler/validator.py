from __future__ import annotations

from collections import Counter

from app.core.control_flow_state_analysis import find_ambiguous_state_reads
from app.core.schemas.node_system import (
    FIXED_CONDITION_BRANCHES,
    FIXED_CONDITION_BRANCH_MAPPING,
    GraphValidationResponse,
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemGraphDocument,
    NodeSystemGraphEdge,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemSubgraphNode,
    NodeSystemStateType,
    ValidationIssue,
)
from app.core.schemas.skills import SkillLlmNodeEligibility, SkillCatalogStatus, SkillDefinition
from app.skills.definitions import get_skill_catalog_registry
from app.skills.registry import get_skill_registry

LEGACY_BREAKPOINT_METADATA_KEYS = (
    "interrupt_before",
    "interruptBefore",
    "interruptAfter",
    "agent_breakpoint_timing",
)


def validate_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []
    runtime_skill_keys = set(get_skill_registry().keys())
    skill_catalog = get_skill_catalog_registry(include_disabled=True)

    nodes_by_name = graph.nodes
    state_schema = graph.state_schema
    edge_counts = Counter((edge.source, edge.target) for edge in graph.edges)

    issues.extend(_validate_graph_metadata(graph, "metadata"))

    for edge_key, count in edge_counts.items():
        if count <= 1:
            continue
        source, target = edge_key
        issues.append(
            ValidationIssue(
                code="duplicate_edge",
                message=f"Duplicate edge '{source} -> {target}' detected. Keep a single explicit connection.",
                path="edges",
            )
        )

    for node_name, node in nodes_by_name.items():
        issues.extend(_validate_node_shape(node_name, node))
        if isinstance(node, NodeSystemAgentNode):
            issues.extend(_validate_agent_node(node_name, node, state_schema, runtime_skill_keys, skill_catalog))
        elif isinstance(node, NodeSystemConditionNode):
            issues.extend(_validate_condition_node(node_name, node, graph))
        elif isinstance(node, NodeSystemSubgraphNode):
            issues.extend(_validate_subgraph_node(node_name, node, runtime_skill_keys, skill_catalog))

    for index, edge in enumerate(graph.edges):
        issues.extend(_validate_edge(index, edge, graph))

    for index, conditional_edge in enumerate(graph.conditional_edges):
        issues.extend(_validate_conditional_edge(index, conditional_edge.source, conditional_edge.branches, graph))

    for ambiguous_read in find_ambiguous_state_reads(graph):
        issues.append(
            ValidationIssue(
                code="state_writer_order_ambiguous",
                message=(
                    f"State '{ambiguous_read.state_key}' reaches reader '{ambiguous_read.node_id}' "
                    "from multiple unordered writers."
                ),
                path=f"nodes.{ambiguous_read.node_id}.reads",
            )
        )

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


def _prefix_issues(issues: list[ValidationIssue], path_prefix: str) -> list[ValidationIssue]:
    return [
        ValidationIssue(
            code=issue.code,
            message=issue.message,
            path=f"{path_prefix}.{issue.path}" if issue.path else path_prefix,
        )
        for issue in issues
    ]


def _validate_graph_metadata(graph: object, path_prefix: str) -> list[ValidationIssue]:
    metadata = getattr(graph, "metadata", {})
    if not isinstance(metadata, dict):
        return []

    issues: list[ValidationIssue] = []
    for key in LEGACY_BREAKPOINT_METADATA_KEYS:
        if key not in metadata:
            continue
        issues.append(
            ValidationIssue(
                code="legacy_breakpoint_metadata_not_supported",
                message=(
                    f"Graph metadata '{key}' is no longer supported. "
                    "Use metadata.interrupt_after for node breakpoints."
                ),
                path=f"{path_prefix}.{key}",
            )
        )
    return issues


def _validate_embedded_graph(
    graph: object,
    *,
    runtime_skill_keys: set[str],
    skill_catalog: dict[str, SkillDefinition],
    path_prefix: str,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    issues.extend(_validate_graph_metadata(graph, f"{path_prefix}.metadata"))
    for node_name, node in getattr(graph, "nodes", {}).items():
        issues.extend(_prefix_issues(_validate_node_shape(node_name, node), f"{path_prefix}.nodes.{node_name}"))
        if isinstance(node, NodeSystemAgentNode):
            issues.extend(
                _prefix_issues(
                    _validate_agent_node(
                        node_name,
                        node,
                        getattr(graph, "state_schema", {}),
                        runtime_skill_keys,
                        skill_catalog,
                    ),
                    f"{path_prefix}.nodes.{node_name}",
                )
            )
        elif isinstance(node, NodeSystemConditionNode):
            issues.extend(_prefix_issues(_validate_condition_node(node_name, node, graph), path_prefix))
        elif isinstance(node, NodeSystemSubgraphNode):
            issues.extend(
                _prefix_issues(
                    _validate_subgraph_node(node_name, node, runtime_skill_keys, skill_catalog),
                    f"{path_prefix}.nodes.{node_name}",
                )
            )

    for index, edge in enumerate(getattr(graph, "edges", [])):
        issues.extend(_prefix_issues(_validate_edge(index, edge, graph), path_prefix))

    for index, conditional_edge in enumerate(getattr(graph, "conditional_edges", [])):
        issues.extend(
            _prefix_issues(
                _validate_conditional_edge(index, conditional_edge.source, conditional_edge.branches, graph),
                path_prefix,
            )
        )

    for ambiguous_read in find_ambiguous_state_reads(graph):
        issues.append(
            ValidationIssue(
                code="state_writer_order_ambiguous",
                message=(
                    f"State '{ambiguous_read.state_key}' reaches reader '{ambiguous_read.node_id}' "
                    "from multiple unordered writers."
                ),
                path=f"{path_prefix}.nodes.{ambiguous_read.node_id}.reads",
            )
        )
    return issues


def _subgraph_input_boundaries(node: NodeSystemSubgraphNode) -> list[tuple[str, str]]:
    boundaries: list[tuple[str, str]] = []
    for inner_node_name, inner_node in node.config.graph.nodes.items():
        if isinstance(inner_node, NodeSystemInputNode) and inner_node.writes:
            boundaries.append((inner_node_name, inner_node.writes[0].state))
    return boundaries


def _subgraph_output_boundaries(node: NodeSystemSubgraphNode) -> list[tuple[str, str]]:
    boundaries: list[tuple[str, str]] = []
    for inner_node_name, inner_node in node.config.graph.nodes.items():
        if isinstance(inner_node, NodeSystemOutputNode) and inner_node.reads:
            boundaries.append((inner_node_name, inner_node.reads[0].state))
    return boundaries


def _validate_subgraph_node(
    node_name: str,
    node: NodeSystemSubgraphNode,
    runtime_skill_keys: set[str],
    skill_catalog: dict[str, SkillDefinition],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    input_boundaries = _subgraph_input_boundaries(node)
    output_boundaries = _subgraph_output_boundaries(node)

    if len(node.reads) < len(input_boundaries):
        missing = input_boundaries[len(node.reads) :]
        labels = ", ".join(f"{inner_node}.{state_key}" for inner_node, state_key in missing)
        issues.append(
            ValidationIssue(
                code="subgraph_input_binding_missing",
                message=f"Subgraph node '{node_name}' is missing parent inputs for: {labels}.",
                path=f"nodes.{node_name}.reads",
            )
        )
    if len(node.reads) > len(input_boundaries):
        issues.append(
            ValidationIssue(
                code="subgraph_input_binding_extra",
                message=f"Subgraph node '{node_name}' has more parent inputs than embedded input boundaries.",
                path=f"nodes.{node_name}.reads",
            )
        )
    for index, binding in enumerate(node.reads[: len(input_boundaries)]):
        if not binding.required:
            issues.append(
                ValidationIssue(
                    code="subgraph_input_binding_not_required",
                    message=f"Subgraph node '{node_name}' input {index + 1} must be required.",
                    path=f"nodes.{node_name}.reads.{index}.required",
                )
            )

    if len(node.writes) < len(output_boundaries):
        missing = output_boundaries[len(node.writes) :]
        labels = ", ".join(f"{inner_node}.{state_key}" for inner_node, state_key in missing)
        issues.append(
            ValidationIssue(
                code="subgraph_output_binding_missing",
                message=f"Subgraph node '{node_name}' is missing parent outputs for: {labels}.",
                path=f"nodes.{node_name}.writes",
            )
        )
    if len(node.writes) > len(output_boundaries):
        issues.append(
            ValidationIssue(
                code="subgraph_output_binding_extra",
                message=f"Subgraph node '{node_name}' has more parent outputs than embedded output boundaries.",
                path=f"nodes.{node_name}.writes",
            )
        )

    issues.extend(
        _validate_embedded_graph(
            node.config.graph,
            runtime_skill_keys=runtime_skill_keys,
            skill_catalog=skill_catalog,
            path_prefix=f"nodes.{node_name}.config.graph",
        )
    )
    return issues


def _validate_agent_node(
    node_name: str,
    node: NodeSystemAgentNode,
    state_schema: dict[str, object],
    runtime_skill_keys: set[str],
    skill_catalog: dict[str, SkillDefinition],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    dynamic_capability_state_reads = _agent_capability_state_reads(node, state_schema)
    if node.config.skill_bindings and not node.config.skill_key:
        issues.append(
            ValidationIssue(
                code="agent_skill_binding_without_skill_key",
                message=(
                    f"LLM node '{node_name}' defines skillBindings without a static skillKey. "
                    "Use skillKey for static skills or a capability state input with one result_package output for dynamic capabilities."
                ),
                path=f"nodes.{node_name}.config.skillBindings",
            )
        )
    for binding_index, binding in enumerate(node.config.skill_bindings):
        if node.config.skill_key and binding.skill_key != node.config.skill_key:
            issues.append(
                ValidationIssue(
                    code="agent_skill_binding_mismatched_skill_key",
                    message=(
                        f"LLM node '{node_name}' maps skill '{binding.skill_key}', but its static skillKey is "
                        f"'{node.config.skill_key}'."
                    ),
                    path=f"nodes.{node_name}.config.skillBindings.{binding_index}.skillKey",
                )
            )

    if node.config.skill_key and dynamic_capability_state_reads:
        issues.append(
            ValidationIssue(
                code="agent_static_and_dynamic_capability_mixed",
                message=(
                    f"LLM node '{node_name}' cannot combine a static skillKey with capability state inputs. "
                    "Use either a static mounted skill or a dynamic capability executor."
                ),
                path=f"nodes.{node_name}.reads",
            )
        )
    if not node.config.skill_key and dynamic_capability_state_reads:
        result_package_writes = [
            binding.state
            for binding in node.writes
            if getattr(state_schema.get(binding.state), "type", None) == NodeSystemStateType.RESULT_PACKAGE
        ]
        if len(node.writes) != 1 or len(result_package_writes) != 1:
            issues.append(
                ValidationIssue(
                    code="dynamic_capability_output_state_invalid",
                    message=(
                        f"LLM node '{node_name}' reads a capability state dynamically and must write exactly one "
                        "result_package state."
                    ),
                    path=f"nodes.{node_name}.writes",
                )
            )

    skill_refs = _iter_agent_skill_refs(node_name, node)
    for skill_key, skill_path in skill_refs:
        definition = skill_catalog.get(skill_key)
        if definition is None:
            issues.append(
                ValidationIssue(
                    code="agent_skill_not_runtime_registered",
                    message=(
                        f"LLM node '{node_name}' attaches skill '{skill_key}', "
                        "but the skill is not runtime-registered."
                    ),
                    path=skill_path,
                )
            )
            continue

        if definition.status != SkillCatalogStatus.ACTIVE:
            issues.append(
                ValidationIssue(
                    code="agent_skill_disabled",
                    message=f"LLM node '{node_name}' attaches skill '{skill_key}', but the skill is disabled.",
                    path=skill_path,
                )
            )
            continue

        if definition.llm_node_eligibility != SkillLlmNodeEligibility.READY:
            blockers = "; ".join(definition.llm_node_blockers) or "No readiness details provided."
            issues.append(
                ValidationIssue(
                    code="agent_skill_not_agent_node_ready",
                    message=(
                        f"Skill '{skill_key}' needs a GraphiteUI LLM-node manifest before it can be used by LLM nodes. "
                        f"{blockers}"
                    ),
                    path=skill_path,
                )
            )

        if skill_key not in runtime_skill_keys or not definition.runtime_registered:
            issues.append(
                ValidationIssue(
                    code="agent_skill_not_runtime_registered",
                    message=(
                        f"LLM node '{node_name}' attaches skill '{skill_key}', "
                        "but the skill is not runtime-registered."
                    ),
                    path=skill_path,
                )
            )

    issues.extend(_validate_agent_skill_bindings(node_name, node, state_schema, skill_catalog))

    return issues


def _iter_agent_skill_refs(node_name: str, node: NodeSystemAgentNode) -> list[tuple[str, str]]:
    refs: list[tuple[str, str]] = []
    if node.config.skill_key:
        refs.append((node.config.skill_key, f"nodes.{node_name}.config.skillKey"))
    return refs


def _agent_capability_state_reads(
    node: NodeSystemAgentNode,
    state_schema: dict[str, object],
) -> list[str]:
    state_keys: list[str] = []
    for binding in node.reads:
        definition = state_schema.get(binding.state)
        if getattr(definition, "type", None) == NodeSystemStateType.CAPABILITY:
            state_keys.append(binding.state)
    return state_keys


def _validate_condition_node(
    node_name: str,
    node: NodeSystemConditionNode,
    graph: NodeSystemGraphDocument,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    if node.config.branches != list(FIXED_CONDITION_BRANCHES):
        issues.append(
            ValidationIssue(
                code="condition_branches_not_fixed",
                message=f"Condition node '{node_name}' must use fixed branches: true, false, exhausted.",
                path=f"nodes.{node_name}.config.branches",
            )
        )
    if node.config.branch_mapping != FIXED_CONDITION_BRANCH_MAPPING:
        issues.append(
            ValidationIssue(
                code="condition_branch_mapping_not_fixed",
                message=f"Condition node '{node_name}' must use fixed true/false branch mapping.",
                path=f"nodes.{node_name}.config.branchMapping",
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


def _validate_agent_skill_bindings(
    node_name: str,
    node: NodeSystemAgentNode,
    state_schema: dict[str, object],
    skill_catalog: dict[str, SkillDefinition],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for binding_index, binding in enumerate(node.config.skill_bindings):
        definition = skill_catalog.get(binding.skill_key)
        if definition is None:
            continue
        for output_key, state_key in binding.output_mapping.items():
            if state_key not in state_schema:
                issues.append(
                    ValidationIssue(
                        code="agent_skill_output_state_unknown",
                        message=(
                            f"LLM node '{node_name}' maps output '{output_key}' from skill '{binding.skill_key}' "
                            f"to unknown state '{state_key}'."
                        ),
                        path=f"nodes.{node_name}.config.skillBindings.{binding_index}.outputMapping.{output_key}",
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
                message=f"Edge '{edge.source} -> {edge.target}' references missing source node '{edge.source}'.",
                path=f"edges.{index}.source",
            )
        )
        return issues
    if target_node is None:
        issues.append(
            ValidationIssue(
                code="edge_target_missing",
                message=f"Edge '{edge.source} -> {edge.target}' references missing target node '{edge.target}'.",
                path=f"edges.{index}.target",
            )
        )
        return issues

    if source_node.kind not in {"input", "agent", "subgraph"}:
        issues.append(
            ValidationIssue(
                code="edge_source_kind_invalid",
                message=f"Node '{edge.source}' cannot emit a plain control-flow edge.",
                path=f"edges.{index}",
            )
        )

    if target_node.kind not in {"agent", "condition", "output", "subgraph"}:
        issues.append(
            ValidationIssue(
                code="edge_target_kind_invalid",
                message=f"Node '{edge.target}' cannot accept a plain control-flow edge.",
                path=f"edges.{index}",
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

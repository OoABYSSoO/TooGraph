from __future__ import annotations

from collections import Counter

from app.core.control_flow_state_analysis import find_ambiguous_state_reads
from app.core.runtime.condition_eval import (
    resolve_condition_source_state_type,
    validate_condition_rule_value_for_state_type,
)
from app.core.schemas.node_system import (
    FIXED_CONDITION_BRANCHES,
    FIXED_CONDITION_BRANCH_MAPPING,
    GraphValidationResponse,
    NodeSystemAgentNode,
    NodeSystemBatchNode,
    NodeSystemConditionNode,
    NodeSystemGraphDocument,
    NodeSystemGraphEdge,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemSubgraphNode,
    NodeSystemToolNode,
    NodeSystemReadBindingKind,
    NodeSystemStateBindingKind,
    NodeSystemStateType,
    ValidationIssue,
)
from app.core.schemas.actions import ActionLlmNodeEligibility, ActionCatalogStatus, ActionDefinition
from app.core.schemas.tools import ToolCatalogStatus, ToolDefinition
from app.actions.definitions import get_action_catalog_registry
from app.actions.registry import get_action_registry
from app.graph_tools.definitions import get_tool_catalog_registry
from app.graph_tools.registry import get_tool_registry

LEGACY_BREAKPOINT_METADATA_KEYS = (
    "interrupt_before",
    "interruptBefore",
    "interruptAfter",
    "agent_breakpoint_timing",
)


def validate_graph(graph: NodeSystemGraphDocument) -> GraphValidationResponse:
    issues: list[ValidationIssue] = []
    runtime_action_keys = set(get_action_registry().keys())
    action_catalog = get_action_catalog_registry(include_disabled=True)
    runtime_tool_keys = set(get_tool_registry().keys())
    tool_catalog = get_tool_catalog_registry(include_disabled=True)

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
            issues.extend(_validate_agent_node(node_name, node, state_schema, runtime_action_keys, action_catalog))
        elif isinstance(node, NodeSystemBatchNode):
            issues.extend(_validate_batch_node(node_name, node))
        elif isinstance(node, NodeSystemConditionNode):
            issues.extend(_validate_condition_node(node_name, node, graph))
        elif isinstance(node, NodeSystemSubgraphNode):
            issues.extend(
                _validate_subgraph_node(
                    node_name,
                    node,
                    runtime_action_keys,
                    action_catalog,
                    runtime_tool_keys,
                    tool_catalog,
                )
            )
        elif isinstance(node, NodeSystemToolNode):
            issues.extend(_validate_tool_node(node_name, node, state_schema, runtime_tool_keys, tool_catalog))

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
    runtime_action_keys: set[str],
    action_catalog: dict[str, ActionDefinition],
    runtime_tool_keys: set[str],
    tool_catalog: dict[str, ToolDefinition],
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
                        runtime_action_keys,
                        action_catalog,
                    ),
                    f"{path_prefix}.nodes.{node_name}",
                )
            )
        elif isinstance(node, NodeSystemBatchNode):
            issues.extend(_prefix_issues(_validate_batch_node(node_name, node), f"{path_prefix}.nodes.{node_name}"))
        elif isinstance(node, NodeSystemConditionNode):
            issues.extend(_prefix_issues(_validate_condition_node(node_name, node, graph), path_prefix))
        elif isinstance(node, NodeSystemSubgraphNode):
            issues.extend(
                _prefix_issues(
                    _validate_subgraph_node(
                        node_name,
                        node,
                        runtime_action_keys,
                        action_catalog,
                        runtime_tool_keys,
                        tool_catalog,
                    ),
                    f"{path_prefix}.nodes.{node_name}",
                )
            )
        elif isinstance(node, NodeSystemToolNode):
            issues.extend(
                _prefix_issues(
                    _validate_tool_node(
                        node_name,
                        node,
                        getattr(graph, "state_schema", {}),
                        runtime_tool_keys,
                        tool_catalog,
                    ),
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


def _validate_batch_node(node_name: str, node: NodeSystemBatchNode) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    read_states = {binding.state for binding in node.reads}
    batch_states = [
        state_key
        for state_key, mode in node.config.input_modes.items()
        if getattr(mode, "value", mode) == "batch"
    ]
    worker_source = getattr(node.config.worker_source, "value", node.config.worker_source)

    if not node.reads:
        issues.append(
            ValidationIssue(
                code="batch_read_missing",
                message=f"Batch node '{node_name}' must read at least one input state.",
                path=f"nodes.{node_name}.reads",
            )
        )
    if not node.writes:
        issues.append(
            ValidationIssue(
                code="batch_write_missing",
                message=f"Batch node '{node_name}' must write at least one assembled output state.",
                path=f"nodes.{node_name}.writes",
            )
        )
    if not batch_states:
        issues.append(
            ValidationIssue(
                code="batch_input_missing",
                message=f"Batch node '{node_name}' must mark at least one input state as batch.",
                path=f"nodes.{node_name}.config.inputModes",
            )
        )
    for state_key in node.config.input_modes:
        if state_key not in read_states:
            issues.append(
                ValidationIssue(
                    code="batch_input_mode_unknown_state",
                    message=f"Batch node '{node_name}' config references unread input state '{state_key}'.",
                    path=f"nodes.{node_name}.config.inputModes.{state_key}",
                )
            )
    if worker_source == "default_llm" and node.config.default_worker.action_key:
        issues.append(
            ValidationIssue(
                code="batch_default_worker_action_not_supported",
                message=f"Batch node '{node_name}' default worker currently supports one LLM turn without an Action.",
                path=f"nodes.{node_name}.config.defaultWorker.actionKey",
            )
        )
    if worker_source == "subgraph":
        if node.config.subgraph_worker is None:
            issues.append(
                ValidationIssue(
                    code="batch_subgraph_worker_missing",
                    message=f"Batch node '{node_name}' selected a template worker but has no embedded graph snapshot.",
                    path=f"nodes.{node_name}.config.subgraphWorker",
                )
            )
        else:
            worker_node = _batch_subgraph_worker_node(node)
            input_boundaries = _subgraph_input_boundaries(worker_node)
            output_boundaries = _subgraph_output_boundaries(worker_node)
            if len(node.reads) < len(input_boundaries):
                missing = input_boundaries[len(node.reads) :]
                labels = ", ".join(f"{inner_node}.{state_key}" for inner_node, state_key in missing)
                issues.append(
                    ValidationIssue(
                        code="batch_subgraph_input_binding_missing",
                        message=f"Batch node '{node_name}' template worker is missing parent inputs for: {labels}.",
                        path=f"nodes.{node_name}.reads",
                    )
                )
            if len(node.reads) > len(input_boundaries):
                issues.append(
                    ValidationIssue(
                        code="batch_subgraph_input_binding_extra",
                        message=f"Batch node '{node_name}' has more parent inputs than template worker input boundaries.",
                        path=f"nodes.{node_name}.reads",
                    )
                )
            for index, binding in enumerate(node.reads[: len(input_boundaries)]):
                if not binding.required:
                    issues.append(
                        ValidationIssue(
                            code="batch_subgraph_input_not_required",
                            message=f"Batch node '{node_name}' template worker input {index + 1} must be required.",
                            path=f"nodes.{node_name}.reads.{index}.required",
                        )
                    )
            if len(node.writes) < len(output_boundaries):
                missing = output_boundaries[len(node.writes) :]
                labels = ", ".join(f"{inner_node}.{state_key}" for inner_node, state_key in missing)
                issues.append(
                    ValidationIssue(
                        code="batch_subgraph_output_binding_missing",
                        message=f"Batch node '{node_name}' template worker is missing parent outputs for: {labels}.",
                        path=f"nodes.{node_name}.writes",
                    )
                )
            if len(node.writes) > len(output_boundaries):
                issues.append(
                    ValidationIssue(
                        code="batch_subgraph_output_binding_extra",
                        message=f"Batch node '{node_name}' has more parent outputs than template worker output boundaries.",
                        path=f"nodes.{node_name}.writes",
                    )
                )
    return issues


def _batch_subgraph_worker_node(node: NodeSystemBatchNode) -> NodeSystemSubgraphNode:
    if node.config.subgraph_worker is None:
        raise ValueError("Batch subgraph worker is missing.")
    return NodeSystemSubgraphNode(
        kind="subgraph",
        name=node.config.subgraph_worker.label or node.name,
        description=node.description,
        ui=node.ui,
        reads=list(node.reads),
        writes=list(node.writes),
        config={"graph": node.config.subgraph_worker.graph.model_dump(by_alias=True, mode="json")},
    )


def _validate_subgraph_node(
    node_name: str,
    node: NodeSystemSubgraphNode,
    runtime_action_keys: set[str],
    action_catalog: dict[str, ActionDefinition],
    runtime_tool_keys: set[str],
    tool_catalog: dict[str, ToolDefinition],
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
            runtime_action_keys=runtime_action_keys,
            action_catalog=action_catalog,
            runtime_tool_keys=runtime_tool_keys,
            tool_catalog=tool_catalog,
            path_prefix=f"nodes.{node_name}.config.graph",
        )
    )
    return issues


def _validate_tool_node(
    node_name: str,
    node: NodeSystemToolNode,
    state_schema: dict[str, object],
    runtime_tool_keys: set[str],
    tool_catalog: dict[str, ToolDefinition],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    tool_key = node.config.tool_key
    if not tool_key:
        issues.append(
            ValidationIssue(
                code="tool_key_missing",
                message=f"Tool node '{node_name}' must select a toolKey.",
                path=f"nodes.{node_name}.config.toolKey",
            )
        )
        return issues

    definition = tool_catalog.get(tool_key)
    if definition is None or tool_key not in runtime_tool_keys or not getattr(definition, "runtime_registered", False):
        issues.append(
            ValidationIssue(
                code="tool_not_runtime_registered",
                message=f"Tool node '{node_name}' selects tool '{tool_key}', but the tool is not runtime-registered.",
                path=f"nodes.{node_name}.config.toolKey",
            )
        )
        return issues

    if definition.status != ToolCatalogStatus.ACTIVE:
        issues.append(
            ValidationIssue(
                code="tool_disabled",
                message=f"Tool node '{node_name}' selects tool '{tool_key}', but the tool is disabled.",
                path=f"nodes.{node_name}.config.toolKey",
            )
        )

    input_fields = {field.key for field in definition.input_schema}
    output_fields = {field.key for field in definition.output_schema}
    bound_input_fields: set[str] = set()

    for read_index, read in enumerate(node.reads):
        binding = read.binding
        if binding is None or binding.kind != NodeSystemReadBindingKind.TOOL_INPUT:
            issues.append(
                ValidationIssue(
                    code="tool_input_binding_missing",
                    message=f"Tool node '{node_name}' input state '{read.state}' must use a managed tool_input binding.",
                    path=f"nodes.{node_name}.reads.{read_index}.binding",
                )
            )
            continue
        if binding.tool_key != tool_key:
            issues.append(
                ValidationIssue(
                    code="tool_input_binding_tool_mismatch",
                    message=(
                        f"Tool node '{node_name}' input state '{read.state}' is bound to tool "
                        f"'{binding.tool_key}', expected '{tool_key}'."
                    ),
                    path=f"nodes.{node_name}.reads.{read_index}.binding.toolKey",
                )
            )
        if binding.field_key not in input_fields:
            issues.append(
                ValidationIssue(
                    code="tool_input_binding_field_unknown",
                    message=(
                        f"Tool node '{node_name}' input state '{read.state}' is bound to unknown "
                        f"Tool input field '{binding.field_key}'."
                    ),
                    path=f"nodes.{node_name}.reads.{read_index}.binding.fieldKey",
                )
            )
        bound_input_fields.add(binding.field_key)

    for field_key in sorted(input_fields - bound_input_fields):
        issues.append(
            ValidationIssue(
                code="tool_input_binding_missing",
                message=f"Tool node '{node_name}' is missing a state input for Tool field '{field_key}'.",
                path=f"nodes.{node_name}.reads",
            )
        )

    for write_index, write in enumerate(node.writes):
        state_definition = state_schema.get(write.state)
        binding = getattr(state_definition, "binding", None)
        if binding is None or binding.kind != NodeSystemStateBindingKind.TOOL_OUTPUT:
            issues.append(
                ValidationIssue(
                    code="tool_output_binding_missing",
                    message=f"Tool node '{node_name}' output state '{write.state}' must use a managed tool_output binding.",
                    path=f"nodes.{node_name}.writes.{write_index}",
                )
            )
            continue
        if binding.tool_key != tool_key:
            issues.append(
                ValidationIssue(
                    code="tool_output_binding_tool_mismatch",
                    message=(
                        f"Tool node '{node_name}' output state '{write.state}' is bound to tool "
                        f"'{binding.tool_key}', expected '{tool_key}'."
                    ),
                    path=f"state_schema.{write.state}.binding.toolKey",
                )
            )
        if binding.node_id != node_name:
            issues.append(
                ValidationIssue(
                    code="tool_output_binding_node_mismatch",
                    message=(
                        f"Tool output state '{write.state}' is bound to node '{binding.node_id}', "
                        f"expected '{node_name}'."
                    ),
                    path=f"state_schema.{write.state}.binding.nodeId",
                )
            )
        if binding.field_key not in output_fields:
            issues.append(
                ValidationIssue(
                    code="tool_output_binding_field_unknown",
                    message=(
                        f"Tool node '{node_name}' output state '{write.state}' is bound to unknown "
                        f"Tool output field '{binding.field_key}'."
                    ),
                    path=f"state_schema.{write.state}.binding.fieldKey",
                )
            )

    return issues


def _validate_agent_node(
    node_name: str,
    node: NodeSystemAgentNode,
    state_schema: dict[str, object],
    runtime_action_keys: set[str],
    action_catalog: dict[str, ActionDefinition],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    dynamic_capability_state_reads = _agent_capability_state_reads(node, state_schema)
    if node.config.action_bindings and not node.config.action_key:
        issues.append(
            ValidationIssue(
                code="agent_action_binding_without_action_key",
                message=(
                    f"LLM node '{node_name}' defines actionBindings without a static actionKey. "
                    "Use actionKey for static Actions or a capability state input with one result_package output for dynamic capabilities."
                ),
                path=f"nodes.{node_name}.config.actionBindings",
            )
        )
    for binding_index, binding in enumerate(node.config.action_bindings):
        if node.config.action_key and binding.action_key != node.config.action_key:
            issues.append(
                ValidationIssue(
                    code="agent_action_binding_mismatched_action_key",
                    message=(
                        f"LLM node '{node_name}' maps Action '{binding.action_key}', but its static actionKey is "
                        f"'{node.config.action_key}'."
                    ),
                    path=f"nodes.{node_name}.config.actionBindings.{binding_index}.actionKey",
                )
            )

    if node.config.action_key and dynamic_capability_state_reads:
        issues.append(
            ValidationIssue(
                code="agent_static_and_dynamic_capability_mixed",
                message=(
                    f"LLM node '{node_name}' cannot combine a static actionKey with capability state inputs. "
                    "Use either a static mounted Action or a dynamic capability executor."
                ),
                path=f"nodes.{node_name}.reads",
            )
        )
    if not node.config.action_key and dynamic_capability_state_reads:
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

    action_refs = _iter_agent_action_refs(node_name, node)
    for action_key, action_path in action_refs:
        definition = action_catalog.get(action_key)
        if definition is None:
            issues.append(
                ValidationIssue(
                    code="agent_action_not_runtime_registered",
                    message=(
                        f"LLM node '{node_name}' attaches action '{action_key}', "
                        "but the action is not runtime-registered."
                    ),
                    path=action_path,
                )
            )
            continue

        if definition.status != ActionCatalogStatus.ACTIVE:
            issues.append(
                ValidationIssue(
                    code="agent_action_disabled",
                    message=f"LLM node '{node_name}' attaches action '{action_key}', but the action is disabled.",
                    path=action_path,
                )
            )
            continue

        if definition.llm_node_eligibility != ActionLlmNodeEligibility.READY:
            blockers = "; ".join(definition.llm_node_blockers) or "No readiness details provided."
            issues.append(
                ValidationIssue(
                    code="agent_action_not_agent_node_ready",
                    message=(
                        f"Action '{action_key}' needs a TooGraph LLM-node manifest before it can be used by LLM nodes. "
                        f"{blockers}"
                    ),
                    path=action_path,
                )
            )

        if action_key not in runtime_action_keys or not definition.runtime_registered:
            issues.append(
                ValidationIssue(
                    code="agent_action_not_runtime_registered",
                    message=(
                        f"LLM node '{node_name}' attaches action '{action_key}', "
                        "but the action is not runtime-registered."
                    ),
                    path=action_path,
                )
            )

    issues.extend(_validate_agent_action_bindings(node_name, node, state_schema, action_catalog))

    return issues


def _iter_agent_action_refs(node_name: str, node: NodeSystemAgentNode) -> list[tuple[str, str]]:
    refs: list[tuple[str, str]] = []
    if node.config.action_key:
        refs.append((node.config.action_key, f"nodes.{node_name}.config.actionKey"))
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

    source_type = resolve_condition_source_state_type(node.config.rule.source, graph.state_schema)
    try:
        validate_condition_rule_value_for_state_type(
            source_type,
            node.config.rule.operator.value,
            node.config.rule.value,
        )
    except ValueError as exc:
        issues.append(
            ValidationIssue(
                code="condition_rule_value_type_mismatch",
                message=f"Condition node '{node_name}' has an invalid value for {source_type} state '{node.config.rule.source}': {exc}",
                path=f"nodes.{node_name}.config.rule.value",
            )
        )

    return issues


def _validate_agent_action_bindings(
    node_name: str,
    node: NodeSystemAgentNode,
    state_schema: dict[str, object],
    action_catalog: dict[str, ActionDefinition],
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for binding_index, binding in enumerate(node.config.action_bindings):
        definition = action_catalog.get(binding.action_key)
        if definition is None:
            continue
        for output_key, state_key in binding.output_mapping.items():
            if state_key not in state_schema:
                issues.append(
                    ValidationIssue(
                        code="agent_action_output_state_unknown",
                        message=(
                            f"LLM node '{node_name}' maps output '{output_key}' from Action '{binding.action_key}' "
                            f"to unknown state '{state_key}'."
                        ),
                        path=f"nodes.{node_name}.config.actionBindings.{binding_index}.outputMapping.{output_key}",
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

    if source_node.kind not in {"input", "agent", "batch", "subgraph", "tool"}:
        issues.append(
            ValidationIssue(
                code="edge_source_kind_invalid",
                message=f"Node '{edge.source}' cannot emit a plain control-flow edge.",
                path=f"edges.{index}",
            )
        )

    if target_node.kind not in {"agent", "batch", "condition", "output", "subgraph", "tool"}:
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

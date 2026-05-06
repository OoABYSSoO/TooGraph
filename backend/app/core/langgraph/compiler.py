from __future__ import annotations

from collections import Counter
from app.core.control_flow_state_analysis import find_ambiguous_state_reads
from app.core.langgraph.build_plan import (
    LangGraphBoundaryPlan,
    LangGraphBuildPlan,
    LangGraphConditionalEdgePlan,
    LangGraphEdgePlan,
    LangGraphNodePlan,
    LangGraphRuntimeConditionRoutePlan,
    LangGraphRuntimeConditionStepPlan,
    LangGraphRuntimeRequirements,
)
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemGraphPayload,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemStateType,
    NodeSystemSubgraphNode,
)

RUNTIME_START = "__start__"
RUNTIME_END = "__end__"


def get_langgraph_runtime_unsupported_reasons(
    graph: NodeSystemGraphPayload,
) -> list[str]:
    build_plan = compile_graph_to_langgraph_plan(graph)
    return list(build_plan.requirements.unsupported_reasons)


def compile_graph_to_langgraph_plan(graph: NodeSystemGraphPayload) -> LangGraphBuildPlan:
    incoming_counts = Counter()
    outgoing_counts = Counter()
    for edge in graph.edges:
        incoming_counts[edge.target] += 1
        outgoing_counts[edge.source] += 1
    for conditional_edge in graph.conditional_edges:
        for target in conditional_edge.branches.values():
            incoming_counts[target] += 1
            outgoing_counts[conditional_edge.source] += 1

    unsupported_reasons: list[str] = []

    graph_edges = [
        LangGraphEdgePlan(source=edge.source, target=edge.target)
        for edge in graph.edges
    ]
    conditional_edges_by_source = {
        edge.source: edge
        for edge in graph.conditional_edges
    }

    graph_nodes: dict[str, LangGraphNodePlan] = {}
    skill_keys: set[str] = set()
    for node_name, node in graph.nodes.items():
        attached_skills = list(node.config.skills) if isinstance(node, NodeSystemAgentNode) else []
        if isinstance(node, NodeSystemSubgraphNode):
            for inner_node in node.config.graph.nodes.values():
                if isinstance(inner_node, NodeSystemAgentNode):
                    skill_keys.update(inner_node.config.skills)
        skill_keys.update(attached_skills)
        graph_nodes[node_name] = LangGraphNodePlan(
            name=node.name or node_name,
            kind=node.kind,
            description=node.description,
            reads=[binding.state for binding in node.reads],
            writes=[binding.state for binding in node.writes],
            skill_keys=attached_skills,
            config=node.config.model_dump(by_alias=True),
        )

    runtime_nodes = {
        node_name: graph_nodes[node_name]
        for node_name, node in graph.nodes.items()
        if isinstance(node, (NodeSystemAgentNode, NodeSystemSubgraphNode))
    }
    input_boundaries = [
        LangGraphBoundaryPlan(node=node_name, state=node.writes[0].state)
        for node_name, node in graph.nodes.items()
        if isinstance(node, NodeSystemInputNode) and node.writes
    ]
    output_boundaries = [
        LangGraphBoundaryPlan(node=node_name, state=node.reads[0].state)
        for node_name, node in graph.nodes.items()
        if isinstance(node, NodeSystemOutputNode) and node.reads
    ]

    runtime_edges: list[LangGraphEdgePlan] = []
    runtime_condition_routes: list[LangGraphRuntimeConditionRoutePlan] = []
    runtime_incoming_counts = Counter()
    runtime_outgoing_counts = Counter()
    runtime_entry_candidates: set[str] = set()
    route_sources: set[str] = set()

    def _runtime_target_for_visual_node(target: str) -> str | None:
        target_node = graph.nodes.get(target)
        if isinstance(target_node, (NodeSystemAgentNode, NodeSystemSubgraphNode)):
            return target
        if isinstance(target_node, NodeSystemOutputNode):
            return RUNTIME_END
        if target_node is not None:
            unsupported_reasons.append(
                f"node '{target}' with kind '{target_node.kind}' cannot be used as a runtime branch target."
            )
        return None

    def _runtime_route_key(path: list[LangGraphRuntimeConditionStepPlan]) -> str:
        return " -> ".join(f"{step.condition}.{step.branch}" for step in path)

    def _runtime_condition_paths(
        condition_name: str,
        *,
        visited_conditions: set[str] | None = None,
    ) -> list[tuple[str, str, list[LangGraphRuntimeConditionStepPlan]]]:
        if condition_name in (visited_conditions or set()):
            unsupported_reasons.append(
                f"condition chain starting at '{condition_name}' contains a condition-only cycle."
            )
            return []

        conditional_edge = conditional_edges_by_source.get(condition_name)
        if conditional_edge is None:
            unsupported_reasons.append(
                f"condition '{condition_name}' is missing conditional edge branch targets."
            )
            return []

        paths: list[tuple[str, str, list[LangGraphRuntimeConditionStepPlan]]] = []
        next_visited_conditions = {*(visited_conditions or set()), condition_name}
        for branch, visual_target in conditional_edge.branches.items():
            step = LangGraphRuntimeConditionStepPlan(
                condition=condition_name,
                branch=branch,
                target=visual_target,
            )
            target_node = graph.nodes.get(visual_target)
            if isinstance(target_node, NodeSystemConditionNode):
                nested_paths = _runtime_condition_paths(
                    visual_target,
                    visited_conditions=next_visited_conditions,
                )
                for runtime_target, final_visual_target, nested_path in nested_paths:
                    paths.append((runtime_target, final_visual_target, [step, *nested_path]))
                continue

            runtime_target = _runtime_target_for_visual_node(visual_target)
            if runtime_target is None:
                continue
            paths.append((runtime_target, visual_target, [step]))

        return paths

    def _add_runtime_condition_route(source: str, condition_name: str) -> None:
        route_key = f"{source}:{condition_name}"
        if route_key in route_sources:
            return
        route_sources.add(route_key)

        branches: dict[str, str] = {}
        branch_targets: dict[str, str] = {}
        branch_paths: dict[str, list[LangGraphRuntimeConditionStepPlan]] = {}
        for runtime_target, visual_target, path in _runtime_condition_paths(condition_name):
            path_key = _runtime_route_key(path)
            branches[path_key] = runtime_target
            branch_targets[path_key] = visual_target
            branch_paths[path_key] = path
            if runtime_target != RUNTIME_END:
                runtime_incoming_counts[runtime_target] += 1

        if not branches:
            unsupported_reasons.append(
                f"condition '{condition_name}' has no branch target compatible with agent-only runtime."
            )
            return
        if source != RUNTIME_START:
            runtime_outgoing_counts[source] += 1
        runtime_condition_routes.append(
            LangGraphRuntimeConditionRoutePlan(
                source=source,
                condition=condition_name,
                branches=branches,
                branch_targets=branch_targets,
                branch_paths=branch_paths,
            )
        )

    for edge in graph.edges:
        source_node = graph.nodes.get(edge.source)
        target_node = graph.nodes.get(edge.target)
        if isinstance(source_node, (NodeSystemAgentNode, NodeSystemSubgraphNode)) and isinstance(
            target_node,
            (NodeSystemAgentNode, NodeSystemSubgraphNode),
        ):
            runtime_edges.append(LangGraphEdgePlan(source=edge.source, target=edge.target))
            runtime_outgoing_counts[edge.source] += 1
            runtime_incoming_counts[edge.target] += 1
            continue
        if isinstance(source_node, (NodeSystemAgentNode, NodeSystemSubgraphNode)) and isinstance(target_node, NodeSystemConditionNode):
            _add_runtime_condition_route(edge.source, edge.target)
            continue
        if isinstance(source_node, NodeSystemInputNode) and isinstance(target_node, (NodeSystemAgentNode, NodeSystemSubgraphNode)):
            runtime_entry_candidates.add(edge.target)
            continue
        if isinstance(source_node, NodeSystemInputNode) and isinstance(target_node, NodeSystemConditionNode):
            _add_runtime_condition_route(RUNTIME_START, edge.target)
            continue

    entry_nodes = [
        node_name
        for node_name in graph.nodes
        if incoming_counts.get(node_name, 0) == 0
    ]
    terminal_nodes = [
        node_name
        for node_name in graph.nodes
        if outgoing_counts.get(node_name, 0) == 0
    ]
    runtime_entry_nodes = sorted(
        {
            *runtime_entry_candidates,
            *[
                node_name
                for node_name in runtime_nodes
                if runtime_incoming_counts.get(node_name, 0) == 0
            ],
        }
    )
    runtime_terminal_nodes = [
        node_name
        for node_name in runtime_nodes
        if runtime_outgoing_counts.get(node_name, 0) == 0
    ]

    knowledge_base_states = [
        state_name
        for state_name, definition in graph.state_schema.items()
        if definition.type == NodeSystemStateType.KNOWLEDGE_BASE
    ]

    for ambiguous_read in find_ambiguous_state_reads(graph):
        unsupported_reasons.append(
            f"state '{ambiguous_read.state_key}' reaches reader '{ambiguous_read.node_id}' from multiple unordered writers."
        )

    return LangGraphBuildPlan(
        graph_id=graph.graph_id or "",
        name=graph.name,
        state_schema={
            state_name: definition.model_dump(by_alias=True)
            for state_name, definition in graph.state_schema.items()
        },
        nodes=graph_nodes,
        edges=graph_edges,
        conditional_edges=[
            LangGraphConditionalEdgePlan(source=edge.source, branches=edge.branches)
            for edge in graph.conditional_edges
        ],
        runtime_nodes=runtime_nodes,
        runtime_edges=runtime_edges,
        runtime_condition_routes=runtime_condition_routes,
        input_boundaries=input_boundaries,
        output_boundaries=output_boundaries,
        requirements=LangGraphRuntimeRequirements(
            entry_nodes=entry_nodes,
            terminal_nodes=terminal_nodes,
            runtime_entry_nodes=runtime_entry_nodes,
            runtime_terminal_nodes=runtime_terminal_nodes,
            skill_keys=sorted(skill_keys),
            knowledge_base_states=knowledge_base_states,
            unsupported_reasons=list(dict.fromkeys(unsupported_reasons)),
        ),
    )

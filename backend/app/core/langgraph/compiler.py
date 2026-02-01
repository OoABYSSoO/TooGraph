from __future__ import annotations

from collections import Counter
from typing import Literal

from app.core.langgraph.build_plan import (
    LangGraphBuildPlan,
    LangGraphConditionalEdgePlan,
    LangGraphEdgePlan,
    LangGraphNodePlan,
    LangGraphRuntimeRequirements,
)
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemGraphPayload,
    NodeSystemStateType,
)


RuntimeBackend = Literal["langgraph", "legacy"]


def resolve_graph_runtime_backend(
    graph: NodeSystemGraphPayload,
) -> tuple[RuntimeBackend, list[str]]:
    requested_backend = str(graph.metadata.get("runtime_backend", "")).strip().lower()
    if requested_backend == "legacy":
        return "legacy", ["graph metadata requested legacy runtime"]

    build_plan = compile_graph_to_langgraph_plan(graph)
    unsupported_reasons = list(build_plan.requirements.unsupported_reasons)
    if unsupported_reasons:
        return "legacy", unsupported_reasons
    return "langgraph", []


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

    graph_edges: list[LangGraphEdgePlan] = []
    for edge in graph.edges:
        state_name = _parse_handle_state(edge.source_handle)
        if not state_name or state_name != _parse_handle_state(edge.target_handle):
            unsupported_reasons.append(
                f"edge {edge.source}.{edge.source_handle} -> {edge.target}.{edge.target_handle} does not resolve to a single shared state."
            )
            continue
        graph_edges.append(
            LangGraphEdgePlan(
                source=edge.source,
                target=edge.target,
                state=state_name,
                sourceHandle=edge.source_handle,
                targetHandle=edge.target_handle,
            )
        )

    graph_nodes: dict[str, LangGraphNodePlan] = {}
    skill_keys: set[str] = set()
    for node_name, node in graph.nodes.items():
        if any(binding.mode.value != "replace" for binding in node.writes):
            unsupported_reasons.append(f"node '{node_name}' uses a non-replace state write mode.")

        attached_skills = list(node.config.skills) if isinstance(node, NodeSystemAgentNode) else []
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

    knowledge_base_states = [
        state_name
        for state_name, definition in graph.state_schema.items()
        if definition.type == NodeSystemStateType.KNOWLEDGE_BASE
    ]

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
        requirements=LangGraphRuntimeRequirements(
            entry_nodes=entry_nodes,
            terminal_nodes=terminal_nodes,
            skill_keys=sorted(skill_keys),
            knowledge_base_states=knowledge_base_states,
            unsupported_reasons=list(dict.fromkeys(unsupported_reasons)),
        ),
    )


def _parse_handle_state(handle: str) -> str | None:
    if ":" not in handle:
        return None
    _prefix, state_name = handle.split(":", 1)
    return state_name.strip() or None

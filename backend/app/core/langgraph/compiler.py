from __future__ import annotations

from collections import Counter
from app.core.control_flow_state_analysis import find_ambiguous_state_reads
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
        requirements=LangGraphRuntimeRequirements(
            entry_nodes=entry_nodes,
            terminal_nodes=terminal_nodes,
            skill_keys=sorted(skill_keys),
            knowledge_base_states=knowledge_base_states,
            unsupported_reasons=list(dict.fromkeys(unsupported_reasons)),
        ),
    )

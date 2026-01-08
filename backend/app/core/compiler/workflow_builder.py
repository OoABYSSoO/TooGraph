from __future__ import annotations

from functools import partial

from langgraph.graph import END, START, StateGraph

from app.core.compiler.graph_parser import WorkflowConfig
from app.core.runtime.nodes import execute_runtime_node
from app.core.runtime.router import route_after_condition
from app.core.runtime.state import RunState
from app.core.schemas.graph import NodeType


def build_workflow(workflow_config: WorkflowConfig):
    workflow = StateGraph(RunState)

    for node_id, node in workflow_config.nodes_by_id.items():
        workflow.add_node(node_id, partial(execute_runtime_node, node=node))

    workflow.add_edge(START, workflow_config.start_node_id)

    for node_id, target_node_ids in workflow_config.normal_edges.items():
        for target_node_id in target_node_ids:
            workflow.add_edge(node_id, target_node_id)

    for node_id, route_map in workflow_config.branch_edges.items():
        node = workflow_config.nodes_by_id[node_id]
        workflow.add_conditional_edges(node_id, partial(route_after_condition, node=node), route_map)

    for node_id, node in workflow_config.nodes_by_id.items():
        if node.type == NodeType.END:
            workflow.add_edge(node_id, END)

    return workflow.compile()

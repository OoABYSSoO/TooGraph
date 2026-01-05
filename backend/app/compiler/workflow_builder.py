from __future__ import annotations

from functools import partial

from langgraph.graph import END, START, StateGraph

from app.compiler.graph_parser import WorkflowConfig
from app.runtime.nodes import execute_runtime_node
from app.runtime.router import route_after_evaluator
from app.runtime.state import RunState
from app.schemas.graph import NodeType


def build_workflow(workflow_config: WorkflowConfig):
    workflow = StateGraph(RunState)

    for node_id, node in workflow_config.nodes_by_id.items():
        workflow.add_node(node_id, partial(execute_runtime_node, node=node))

    workflow.add_edge(START, workflow_config.start_node_id)

    for node_id, target_node_id in workflow_config.linear_edges.items():
        workflow.add_edge(node_id, target_node_id)

    for node_id, route_map in workflow_config.conditional_edges.items():
        workflow.add_conditional_edges(node_id, route_after_evaluator, route_map)

    for node_id, node in workflow_config.nodes_by_id.items():
        if node.type == NodeType.FINALIZER:
            workflow.add_edge(node_id, END)

    return workflow.compile()


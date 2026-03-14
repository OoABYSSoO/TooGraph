from __future__ import annotations

import json
from typing import Any

from app.core.runtime.execution_graph import build_conditional_edge_id, build_regular_edge_id
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemOutputNode


def format_loop_limit_exhausted_output_value(value: Any) -> str:
    if isinstance(value, str):
        rendered = value
    elif value is None:
        rendered = ""
    elif isinstance(value, (dict, list, tuple, bool)):
        rendered = json.dumps(value, ensure_ascii=False)
    else:
        rendered = str(value)
    return f"循环已达上限，最新的结果是：{rendered}"


def apply_loop_limit_exhausted_output_message(body: dict[str, Any]) -> dict[str, Any]:
    preview_items = list(body.get("output_previews", []))
    wrapped_final_result = format_loop_limit_exhausted_output_value(
        preview_items[0].get("value") if preview_items else body.get("final_result")
    )
    wrapped_previews: list[dict[str, Any]] = []
    for preview in preview_items:
        wrapped_previews.append(
            {
                **preview,
                "display_mode": "text",
                "value": wrapped_final_result,
            }
        )
    return {
        **body,
        "output_previews": wrapped_previews,
        "final_result": wrapped_final_result,
    }


def resolve_active_output_nodes(
    graph: NodeSystemGraphDocument,
    active_edge_ids: set[str],
) -> set[str]:
    if not active_edge_ids:
        return set()

    active_output_nodes: set[str] = set()
    for edge in graph.edges:
        target_node = graph.nodes.get(edge.target)
        if (
            isinstance(target_node, NodeSystemOutputNode)
            and build_regular_edge_id(edge.source, edge.target) in active_edge_ids
        ):
            active_output_nodes.add(edge.target)

    for conditional_edge in graph.conditional_edges:
        for branch, target in conditional_edge.branches.items():
            target_node = graph.nodes.get(target)
            if (
                isinstance(target_node, NodeSystemOutputNode)
                and build_conditional_edge_id(conditional_edge.source, branch, target) in active_edge_ids
            ):
                active_output_nodes.add(target)

    return active_output_nodes

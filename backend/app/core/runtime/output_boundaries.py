from __future__ import annotations

import copy
from typing import Any

from app.core.runtime.output_artifacts import (
    apply_loop_limit_exhausted_output_message,
    resolve_active_output_nodes,
)
from app.core.runtime.output_boundary_utils import save_output_value
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemOutputNode


def execute_output_node(
    node_name: str,
    node: NodeSystemOutputNode,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    binding = node.reads[0]
    resolved = resolve_output_preview_value(
        binding.state,
        input_values.get(binding.state),
        configured_display_mode=node.config.display_mode.value,
    )
    value = resolved["value"]
    preview = {
        "node_id": node_name,
        "label": resolved["label"],
        "source_kind": "state",
        "source_key": resolved["source_key"],
        "display_mode": resolved["display_mode"],
        "persist_enabled": node.config.persist_enabled,
        "persist_format": node.config.persist_format.value,
        "value": value,
    }
    saved_outputs: list[dict[str, Any]] = []
    if node.config.persist_enabled and value not in (None, "", [], {}):
        saved_outputs.append(
            save_output_value(
                run_id=str(state.get("run_id", "")),
                node_id=node_name,
                source_key=resolved["source_key"],
                value=value,
                persist_format=node.config.persist_format.value,
                file_name_template=node.config.file_name_template or resolved["file_name_template"],
            )
        )
    return {
        "outputs": {binding.state: value},
        "output_previews": [preview],
        "saved_outputs": saved_outputs,
        "final_result": "" if value is None else str(value),
    }


def resolve_output_preview_value(
    state_key: str,
    value: Any,
    *,
    configured_display_mode: str,
) -> dict[str, Any]:
    fallback = {
        "label": state_key,
        "source_key": state_key,
        "display_mode": configured_display_mode,
        "file_name_template": state_key,
        "value": value,
    }
    if not isinstance(value, dict) or value.get("kind") != "result_package":
        return fallback

    outputs = value.get("outputs")
    if not isinstance(outputs, dict) or len(outputs) != 1:
        return fallback

    output_key, raw_output = next(iter(outputs.items()))
    output_key_text = str(output_key or "").strip()
    if not output_key_text:
        return fallback

    if isinstance(raw_output, dict):
        output_value = raw_output.get("value")
        output_name = str(raw_output.get("name") or output_key_text).strip()
        output_type = str(raw_output.get("type") or "").strip()
    else:
        output_value = raw_output
        output_name = output_key_text
        output_type = ""

    return {
        "label": output_name or output_key_text,
        "source_key": f"{state_key}.{output_key_text}",
        "display_mode": resolve_result_package_output_display_mode(configured_display_mode, output_type, output_value),
        "file_name_template": output_key_text,
        "value": output_value,
    }


def resolve_result_package_output_display_mode(
    configured_display_mode: str,
    output_type: str,
    output_value: Any,
) -> str:
    if configured_display_mode != "auto":
        return configured_display_mode
    normalized_type = output_type.strip().lower()
    if normalized_type == "markdown":
        return "markdown"
    if normalized_type in {"json", "capability", "result_package"}:
        return "json"
    if normalized_type in {"file", "image", "audio", "video"}:
        return "documents"
    if normalized_type in {"text", "number", "boolean"}:
        return "plain"
    if isinstance(output_value, (dict, list)):
        return "json"
    return "auto"


def collect_output_boundaries(
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
    active_edge_ids: set[str] | None = None,
) -> None:
    active_output_nodes = resolve_active_output_nodes(graph, active_edge_ids or set())
    output_node_names = {
        node_name
        for node_name, node in graph.nodes.items()
        if isinstance(node, NodeSystemOutputNode)
    }
    refreshed_output_nodes = active_output_nodes or output_node_names
    state["output_previews"] = [
        preview
        for preview in state.get("output_previews", [])
        if preview.get("node_id") not in refreshed_output_nodes
    ]
    state["saved_outputs"] = [
        output
        for output in state.get("saved_outputs", [])
        if output.get("node_id") not in refreshed_output_nodes
    ]
    final_results: list[Any] = []

    for node_name, node in graph.nodes.items():
        if not isinstance(node, NodeSystemOutputNode) or not node.reads:
            continue
        if active_output_nodes and node_name not in active_output_nodes:
            continue

        binding = node.reads[0]
        body = execute_output_node(
            node_name,
            node,
            {binding.state: copy.deepcopy(state.get("state_values", {}).get(binding.state))},
            state,
        )
        if state.get("loop_limit_exhaustion"):
            body = apply_loop_limit_exhausted_output_message(body)
        state["output_previews"] = [*state.get("output_previews", []), *body.get("output_previews", [])]
        state["saved_outputs"] = [*state.get("saved_outputs", []), *body.get("saved_outputs", [])]
        state.setdefault("node_status_map", {})[node_name] = "success"
        if body.get("final_result") not in (None, "", [], {}):
            final_results.append(body["final_result"])

    if final_results:
        state["final_result"] = str(final_results[-1])

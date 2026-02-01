from __future__ import annotations

import copy
import heapq
import inspect
import json
import logging
import re
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any

from app.core.model_catalog import get_default_text_model_ref, normalize_model_ref, resolve_runtime_model_name
from app.core.runtime.output_boundary_utils import save_output_value
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle, utc_now_iso
from app.core.schemas.node_system import (
    NodeSystemAgentNode,
    NodeSystemConditionNode,
    NodeSystemGraphDocument,
    NodeSystemGraphEdge,
    NodeSystemInputNode,
    NodeSystemOutputNode,
    NodeSystemStateDefinition,
    NodeSystemStateType,
)
from app.core.storage.run_store import save_run
from app.skills.registry import get_skill_registry
from app.tools.local_llm import (
    _chat_with_local_model_with_meta,
    get_default_agent_temperature,
    get_default_agent_thinking_enabled,
)

logger = logging.getLogger(__name__)

KNOWLEDGE_BASE_SKILL_KEY = "search_knowledge_base"


@dataclass(frozen=True)
class ExecutionEdge:
    id: str
    source: str
    target: str
    kind: str
    state: str | None = None
    branch: str | None = None


class CycleDetector:
    def __init__(self, edges: list[ExecutionEdge]) -> None:
        self.edges = edges
        self.graph: dict[str, list[ExecutionEdge]] = defaultdict(list)
        for edge in edges:
            self.graph[edge.source].append(edge)

    def detect(self) -> tuple[bool, list[ExecutionEdge]]:
        WHITE, GRAY, BLACK = 0, 1, 2
        color: dict[str, int] = defaultdict(lambda: WHITE)
        back_edges: list[ExecutionEdge] = []

        def dfs(node_name: str) -> None:
            color[node_name] = GRAY
            for edge in self.graph.get(node_name, []):
                neighbor = edge.target
                if color[neighbor] == GRAY:
                    back_edges.append(edge)
                elif color[neighbor] == WHITE:
                    dfs(neighbor)
            color[node_name] = BLACK

        nodes = {edge.source for edge in self.edges} | {edge.target for edge in self.edges}
        for node_name in nodes:
            if color[node_name] == WHITE:
                dfs(node_name)

        return len(back_edges) > 0, back_edges


def execute_node_system_graph(
    graph: NodeSystemGraphDocument,
    initial_state: dict[str, Any] | None = None,
    *,
    persist_progress: bool = False,
) -> dict[str, Any]:
    started_perf = time.perf_counter()
    state = initial_state or create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    set_run_status(state, "running")
    state["runtime_backend"] = "legacy"
    state["started_at"] = utc_now_iso()
    state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    state["metadata"] = dict(graph.metadata)
    state["metadata"]["resolved_runtime_backend"] = "legacy"
    _initialize_graph_state(graph, state)

    execution_edges = _build_execution_edges(graph)
    incoming_edges, outgoing_edges = _index_edges(execution_edges)

    has_cycle, back_edges = CycleDetector(execution_edges).detect()
    back_edge_id_set = {edge.id for edge in back_edges}
    back_edge_labels = [f"{edge.source}→{edge.target}" for edge in back_edges]
    cycle_max_iterations = _resolve_cycle_max_iterations(graph.metadata)
    state["cycle_summary"] = {
        "has_cycle": has_cycle,
        "back_edges": back_edge_labels,
        "iteration_count": 0,
        "max_iterations": cycle_max_iterations if has_cycle else 0,
        "stop_reason": "acyclic" if not has_cycle else None,
    }
    state["cycle_iterations"] = []

    try:
        execution_order = _topological_order(graph.nodes, execution_edges, ignored_edge_ids=back_edge_id_set if has_cycle else None)
    except ValueError as exc:
        raise ValueError(f"Graph '{graph.graph_id}' cannot derive an execution order: {exc}.") from None

    node_outputs: dict[str, dict[str, Any]] = {}
    active_edge_ids: set[str] = set()
    if persist_progress:
        _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)

    if has_cycle:
        _execute_cyclic_graph(
            graph=graph,
            state=state,
            incoming_edges=incoming_edges,
            outgoing_edges=outgoing_edges,
            execution_order=execution_order,
            back_edge_id_set=back_edge_id_set,
            cycle_max_iterations=cycle_max_iterations,
            node_outputs=node_outputs,
            active_edge_ids=active_edge_ids,
            persist_progress=persist_progress,
            started_perf=started_perf,
        )
    else:
        _execute_acyclic_graph(
            graph=graph,
            state=state,
            incoming_edges=incoming_edges,
            outgoing_edges=outgoing_edges,
            execution_order=execution_order,
            node_outputs=node_outputs,
            active_edge_ids=active_edge_ids,
            persist_progress=persist_progress,
            started_perf=started_perf,
        )

    if state.get("status") != "failed":
        set_run_status(state, "completed")
    state["current_node_id"] = None
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
    save_run(state)
    return state


def _execute_acyclic_graph(
    *,
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
    incoming_edges: dict[str, list[ExecutionEdge]],
    outgoing_edges: dict[str, list[ExecutionEdge]],
    execution_order: list[str],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    persist_progress: bool,
    started_perf: float,
) -> None:
    for node_name in execution_order:
        incoming_for_node = incoming_edges.get(node_name, [])
        is_root_node = len(incoming_for_node) == 0
        is_active_node = is_root_node or any(edge.id in active_edge_ids for edge in incoming_for_node)
        if not is_active_node:
            continue

        execution_result = _execute_runtime_node(
            graph=graph,
            node_name=node_name,
            state=state,
            incoming_for_node=incoming_for_node,
            outgoing_for_node=outgoing_edges.get(node_name, []),
            node_outputs=node_outputs,
            active_edge_ids=active_edge_ids,
            iteration=1,
            persist_progress=persist_progress,
            started_perf=started_perf,
        )
        if execution_result["failed"]:
            break

        active_edge_ids.update(execution_result["selected_edge_ids"])

    state["cycle_summary"] = {
        "has_cycle": False,
        "back_edges": [],
        "iteration_count": 1 if state.get("node_executions") else 0,
        "max_iterations": 0,
        "stop_reason": "completed",
    }
    state["cycle_iterations"] = [
        {
            "iteration": 1,
            "executed_node_ids": [item["node_id"] for item in state.get("node_executions", [])],
            "incoming_edge_ids": [],
            "activated_edge_ids": sorted(active_edge_ids),
            "next_iteration_edge_ids": [],
            "stop_reason": "completed",
        }
    ] if state.get("node_executions") else []


def _execute_cyclic_graph(
    *,
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
    incoming_edges: dict[str, list[ExecutionEdge]],
    outgoing_edges: dict[str, list[ExecutionEdge]],
    execution_order: list[str],
    back_edge_id_set: set[str],
    cycle_max_iterations: int,
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    persist_progress: bool,
    started_perf: float,
) -> None:
    non_back_incoming_edges = {
        node_name: [edge for edge in incoming_edges.get(node_name, []) if edge.id not in back_edge_id_set]
        for node_name in graph.nodes
    }
    start_node_names = {
        node_name
        for node_name, node_incoming_edges in non_back_incoming_edges.items()
        if len(node_incoming_edges) == 0
    }
    pending_cycle_edge_ids: set[str] = set()

    if not start_node_names and graph.nodes:
        raise ValueError("Cycle execution requires at least one node to remain reachable after removing back edges.")

    for iteration_index in range(cycle_max_iterations):
        incoming_cycle_edge_ids = set(pending_cycle_edge_ids)
        current_round_active_edge_ids = set(incoming_cycle_edge_ids)
        next_iteration_edge_ids: set[str] = set()
        executed_node_names: list[str] = []

        for node_name in execution_order:
            incoming_for_node = incoming_edges.get(node_name, [])
            is_start_node = iteration_index == 0 and node_name in start_node_names
            is_triggered_by_cycle = any(edge.id in current_round_active_edge_ids for edge in incoming_for_node)
            if not is_start_node and not is_triggered_by_cycle:
                continue

            execution_result = _execute_runtime_node(
                graph=graph,
                node_name=node_name,
                state=state,
                incoming_for_node=incoming_for_node,
                outgoing_for_node=outgoing_edges.get(node_name, []),
                node_outputs=node_outputs,
                active_edge_ids=current_round_active_edge_ids,
                iteration=iteration_index + 1,
                persist_progress=persist_progress,
                started_perf=started_perf,
            )
            executed_node_names.append(node_name)
            if execution_result["failed"]:
                state["cycle_summary"] = {
                    "has_cycle": True,
                    "back_edges": [f"{edge.source}→{edge.target}" for edge in execution_edges_from_graph(graph) if edge.id in back_edge_id_set],
                    "iteration_count": iteration_index + 1,
                    "max_iterations": cycle_max_iterations,
                    "stop_reason": "failed",
                }
                state["cycle_iterations"] = [
                    *state.get("cycle_iterations", []),
                    {
                        "iteration": iteration_index + 1,
                        "executed_node_ids": executed_node_names,
                        "incoming_edge_ids": sorted(incoming_cycle_edge_ids),
                        "activated_edge_ids": sorted(current_round_active_edge_ids),
                        "next_iteration_edge_ids": sorted(next_iteration_edge_ids),
                        "stop_reason": "failed",
                    },
                ]
                return

            selected_edge_ids = execution_result["selected_edge_ids"]
            for edge_id in selected_edge_ids:
                if edge_id in back_edge_id_set:
                    next_iteration_edge_ids.add(edge_id)
                else:
                    current_round_active_edge_ids.add(edge_id)

        stop_reason = None
        if not next_iteration_edge_ids:
            stop_reason = "completed"

        state["cycle_iterations"] = [
            *state.get("cycle_iterations", []),
            {
                "iteration": iteration_index + 1,
                "executed_node_ids": executed_node_names,
                "incoming_edge_ids": sorted(incoming_cycle_edge_ids),
                "activated_edge_ids": sorted(current_round_active_edge_ids),
                "next_iteration_edge_ids": sorted(next_iteration_edge_ids),
                "stop_reason": stop_reason,
            },
        ]
        active_edge_ids.clear()
        active_edge_ids.update(current_round_active_edge_ids)

        if stop_reason == "completed":
            state["cycle_summary"] = {
                "has_cycle": True,
                "back_edges": [f"{edge.source}→{edge.target}" for edge in execution_edges_from_graph(graph) if edge.id in back_edge_id_set],
                "iteration_count": iteration_index + 1,
                "max_iterations": cycle_max_iterations,
                "stop_reason": "completed",
            }
            return

        pending_cycle_edge_ids = next_iteration_edge_ids

    set_run_status(state, "failed")
    state["errors"] = [
        *state.get("errors", []),
        f"Cycle execution exceeded max iterations ({cycle_max_iterations}). Add an exit branch or raise cycle_max_iterations.",
    ]
    state["cycle_summary"] = {
        "has_cycle": True,
        "back_edges": [f"{edge.source}→{edge.target}" for edge in execution_edges_from_graph(graph) if edge.id in back_edge_id_set],
        "iteration_count": cycle_max_iterations,
        "max_iterations": cycle_max_iterations,
        "stop_reason": "max_iterations_exceeded",
    }
    if state.get("cycle_iterations"):
        state["cycle_iterations"][-1]["stop_reason"] = "max_iterations_exceeded"


def execution_edges_from_graph(graph: NodeSystemGraphDocument) -> list[ExecutionEdge]:
    return _build_execution_edges(graph)


def _execute_runtime_node(
    *,
    graph: NodeSystemGraphDocument,
    node_name: str,
    state: dict[str, Any],
    incoming_for_node: list[ExecutionEdge],
    outgoing_for_node: list[ExecutionEdge],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    iteration: int,
    persist_progress: bool,
    started_perf: float,
) -> dict[str, Any]:
    node = graph.nodes[node_name]
    node_started_perf = time.perf_counter()
    state["current_node_id"] = node_name
    state["node_status_map"][node_name] = "running"
    touch_run_lifecycle(state)
    if persist_progress:
        _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)

    try:
        input_values, state_reads = _collect_node_inputs(node, state)
        body = _execute_node(graph, node_name, node, input_values, state)
        duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
        node_outputs[node_name] = body.get("outputs", {})
        state_writes = _apply_state_writes(node_name, node.writes, body.get("outputs", {}), state)
        state["node_status_map"][node_name] = "success"
        if body.get("selected_skills"):
            state["selected_skills"] = [*state.get("selected_skills", []), *body["selected_skills"]]
        if body.get("skill_outputs"):
            state["skill_outputs"] = [*state.get("skill_outputs", []), *body["skill_outputs"]]
        if body.get("output_previews"):
            state["output_previews"] = [*state.get("output_previews", []), *body["output_previews"]]
        if body.get("saved_outputs"):
            state["saved_outputs"] = [*state.get("saved_outputs", []), *body["saved_outputs"]]
        if body.get("final_result"):
            state["final_result"] = str(body["final_result"])
        state["node_executions"] = [
            *state.get("node_executions", []),
            {
                "node_id": node_name,
                "node_type": node.kind,
                "status": "success",
                "started_at": utc_now_iso(),
                "finished_at": utc_now_iso(),
                "duration_ms": duration_ms,
                "input_summary": _summarize_inputs(input_values),
                "output_summary": _summarize_outputs(body.get("outputs", {}), body.get("final_result")),
                "artifacts": {
                    "inputs": input_values,
                    "outputs": body.get("outputs", {}),
                    "family": node.kind,
                    "iteration": iteration,
                    "selected_branch": body.get("selected_branch"),
                    "response": body.get("response"),
                    "reasoning": body.get("reasoning"),
                    "runtime_config": body.get("runtime_config"),
                    "state_reads": state_reads,
                    "state_writes": state_writes,
                },
                "warnings": body.get("warnings", []),
                "errors": [],
            },
        ]
        selected_edge_ids = _select_active_outgoing_edges(outgoing_for_node, body)
        if persist_progress:
            _persist_run_progress(state, node_outputs, active_edge_ids | selected_edge_ids, started_perf=started_perf)
        return {
            "failed": False,
            "selected_edge_ids": selected_edge_ids,
        }
    except Exception as exc:  # pragma: no cover - defensive runtime path
        duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
        state["node_status_map"][node_name] = "failed"
        set_run_status(state, "failed")
        state["errors"] = [*state.get("errors", []), str(exc)]
        state["node_executions"] = [
            *state.get("node_executions", []),
            {
                "node_id": node_name,
                "node_type": node.kind,
                "status": "failed",
                "started_at": utc_now_iso(),
                "finished_at": utc_now_iso(),
                "duration_ms": duration_ms,
                "input_summary": "",
                "output_summary": "",
                "artifacts": {
                    "family": node.kind,
                    "iteration": iteration,
                },
                "warnings": [],
                "errors": [str(exc)],
            },
        ]
        if persist_progress:
            _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)
        return {
            "failed": True,
            "selected_edge_ids": set(),
        }


def _resolve_cycle_max_iterations(metadata: dict[str, Any]) -> int:
    raw_value = metadata.get("cycle_max_iterations", metadata.get("cycleMaxIterations", 12))
    try:
        numeric = int(raw_value)
    except (TypeError, ValueError):
        numeric = 12
    return max(1, min(numeric, 128))


def _persist_run_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
    touch_run_lifecycle(state)
    save_run(state)


def _refresh_run_artifacts(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
) -> None:
    state["duration_ms"] = max(int((time.perf_counter() - started_perf) * 1000), 0)
    saved_outputs = list(state.get("saved_outputs", []))
    exported_outputs = [
        {
            "node_id": preview.get("node_id"),
            "label": preview.get("label"),
            "source_kind": preview.get("source_kind", "state"),
            "source_key": preview.get("source_key"),
            "display_mode": preview.get("display_mode"),
            "persist_enabled": preview.get("persist_enabled"),
            "persist_format": preview.get("persist_format"),
            "value": preview.get("value"),
            "saved_file": next(
                (
                    item
                    for item in saved_outputs
                    if item.get("node_id") == preview.get("node_id")
                    and item.get("source_key") == preview.get("source_key")
                ),
                None,
            ),
        }
        for preview in state.get("output_previews", [])
    ]
    state_values = dict(state.get("state_values", {}))
    state_events = list(state.get("state_events", []))
    state_last_writers = dict(state.get("state_last_writers", {}))
    state["artifacts"] = {
        "skill_outputs": state.get("skill_outputs", []),
        "output_previews": state.get("output_previews", []),
        "saved_outputs": saved_outputs,
        "exported_outputs": exported_outputs,
        "node_outputs": node_outputs,
        "active_edge_ids": sorted(active_edge_ids),
        "state_events": state_events,
        "state_values": state_values,
        "cycle_iterations": list(state.get("cycle_iterations", [])),
        "cycle_summary": dict(state.get("cycle_summary", {})),
    }
    state["state_snapshot"] = {
        "values": state_values,
        "last_writers": state_last_writers,
    }
    state["knowledge_summary"] = _build_knowledge_summary(state.get("skill_outputs", []))


def _initialize_graph_state(graph: NodeSystemGraphDocument, state: dict[str, Any]) -> None:
    initialized_values = {
        state_name: copy.deepcopy(definition.value)
        for state_name, definition in graph.state_schema.items()
    }
    initialized_values.update(dict(state.get("state_values", {})))
    state["state_values"] = initialized_values
    state["state_last_writers"] = dict(state.get("state_last_writers", {}))
    state["state_events"] = list(state.get("state_events", []))
    state["state_snapshot"] = {
        "values": dict(initialized_values),
        "last_writers": dict(state["state_last_writers"]),
    }


def _collect_node_inputs(node: Any, state: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resolved_inputs: dict[str, Any] = {}
    read_records: list[dict[str, Any]] = []
    for binding in node.reads:
        value = copy.deepcopy(state.get("state_values", {}).get(binding.state))
        resolved_inputs[binding.state] = value
        read_records.append(
            {
                "state_key": binding.state,
                "input_key": binding.state,
                "value": value,
            }
        )
    return resolved_inputs, read_records


def _apply_state_writes(
    node_name: str,
    write_bindings: list[Any],
    output_values: dict[str, Any],
    state: dict[str, Any],
) -> list[dict[str, Any]]:
    write_records: list[dict[str, Any]] = []
    state_values = state.setdefault("state_values", {})
    state_last_writers = state.setdefault("state_last_writers", {})
    state_events = state.setdefault("state_events", [])

    for binding in write_bindings:
        value = copy.deepcopy(output_values.get(binding.state))
        state_values[binding.state] = value
        writer_record = {
            "node_id": node_name,
            "output_key": binding.state,
            "mode": binding.mode.value,
            "updated_at": utc_now_iso(),
        }
        state_last_writers[binding.state] = writer_record
        state_events.append(
            {
                "node_id": node_name,
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "value": value,
                "created_at": utc_now_iso(),
            }
        )
        write_records.append(
            {
                "state_key": binding.state,
                "output_key": binding.state,
                "mode": binding.mode.value,
                "value": value,
            }
        )
    return write_records


def _build_execution_edges(graph: NodeSystemGraphDocument) -> list[ExecutionEdge]:
    execution_edges: list[ExecutionEdge] = []
    for edge in graph.edges:
        state_name = _parse_handle_state(edge.source_handle)
        execution_edges.append(
            ExecutionEdge(
                id=_build_regular_edge_id(edge),
                source=edge.source,
                target=edge.target,
                kind="edge",
                state=state_name,
            )
        )

    for conditional_edge in graph.conditional_edges:
        for branch, target in conditional_edge.branches.items():
            execution_edges.append(
                ExecutionEdge(
                    id=_build_conditional_edge_id(conditional_edge.source, branch, target),
                    source=conditional_edge.source,
                    target=target,
                    kind="conditional",
                    branch=branch,
                )
            )
    return execution_edges


def _index_edges(edges: list[ExecutionEdge]) -> tuple[dict[str, list[ExecutionEdge]], dict[str, list[ExecutionEdge]]]:
    incoming_edges: dict[str, list[ExecutionEdge]] = defaultdict(list)
    outgoing_edges: dict[str, list[ExecutionEdge]] = defaultdict(list)
    for edge in edges:
        incoming_edges[edge.target].append(edge)
        outgoing_edges[edge.source].append(edge)
    return incoming_edges, outgoing_edges


def _topological_order(
    nodes: dict[str, Any],
    edges: list[ExecutionEdge],
    *,
    ignored_edge_ids: set[str] | None = None,
) -> list[str]:
    node_priority = _build_output_priority(nodes, edges)
    node_order_lookup = {node_name: index for index, node_name in enumerate(nodes.keys())}
    indegree = {node_name: 0 for node_name in nodes}
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        if ignored_edge_ids and edge.id in ignored_edge_ids:
            continue
        adjacency[edge.source].append(edge.target)
        indegree[edge.target] = indegree.get(edge.target, 0) + 1

    queue: list[tuple[int, int, str]] = []
    for node_name, degree in indegree.items():
        if degree != 0:
            continue
        heapq.heappush(queue, (node_priority[node_name], node_order_lookup[node_name], node_name))

    order: list[str] = []
    while queue:
        _, _, node_name = heapq.heappop(queue)
        order.append(node_name)
        for target in adjacency.get(node_name, []):
            indegree[target] -= 1
            if indegree[target] == 0:
                heapq.heappush(queue, (node_priority[target], node_order_lookup[target], target))

    if len(order) != len(nodes):
        raise ValueError("Node system graph currently requires an acyclic topology once back-edges are ignored.")
    return order


def _build_output_priority(nodes: dict[str, Any], edges: list[ExecutionEdge]) -> dict[str, int]:
    reverse_adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        reverse_adjacency[edge.target].append(edge.source)

    distances: dict[str, int] = {}
    queue = deque(node_name for node_name, node in nodes.items() if isinstance(node, NodeSystemOutputNode))

    for node_name in queue:
        distances[node_name] = 0

    while queue:
        node_name = queue.popleft()
        distance = distances[node_name]
        for parent_name in reverse_adjacency.get(node_name, []):
            next_distance = distance + 1
            current_distance = distances.get(parent_name)
            if current_distance is not None and current_distance <= next_distance:
                continue
            distances[parent_name] = next_distance
            queue.append(parent_name)

    fallback_priority = len(nodes) + len(edges) + 1
    return {
        node_name: distances.get(node_name, fallback_priority)
        for node_name in nodes
    }


def _execute_node(
    graph: NodeSystemGraphDocument,
    node_name: str,
    node: Any,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    graph_context = {
        "metadata": state.get("metadata", {}),
        "state": state.get("state_values", {}),
    }

    if isinstance(node, NodeSystemInputNode):
        return _execute_input_node(graph.state_schema, node, state)
    if isinstance(node, NodeSystemAgentNode):
        return _execute_agent_node(graph.state_schema, node, input_values, graph_context)
    if isinstance(node, NodeSystemOutputNode):
        return _execute_output_node(node_name, node, input_values, state)
    if isinstance(node, NodeSystemConditionNode):
        return _execute_condition_node(node, input_values, graph_context)
    raise ValueError(f"Unsupported node kind '{node.kind}'.")


def _execute_input_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemInputNode,
    state: dict[str, Any],
) -> dict[str, Any]:
    outputs: dict[str, Any] = {}
    for binding in node.writes:
        definition = state_schema[binding.state]
        raw_value = node.config.value
        value = _coerce_input_boundary_value(raw_value, definition.type)
        outputs[binding.state] = value

    final_result = _first_truthy(outputs.values())
    return {
        "outputs": outputs,
        "final_result": "" if final_result is None else str(final_result),
    }


def _execute_agent_node(
    state_schema: dict[str, NodeSystemStateDefinition],
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
) -> dict[str, Any]:
    selected_skills: list[str] = []
    skill_outputs: list[dict[str, Any]] = []
    skill_context: dict[str, Any] = {}
    registry = get_skill_registry(include_disabled=False)
    response_payload: dict[str, Any] = {}
    response_reasoning = ""
    warnings: list[str] = []
    runtime_config = _resolve_agent_runtime_config(node)

    knowledge_read = next(
        (
            binding.state
            for binding in node.reads
            if state_schema[binding.state].type == NodeSystemStateType.KNOWLEDGE_BASE
        ),
        None,
    )
    query_read = next(
        (
            binding.state
            for binding in node.reads
            if binding.state != knowledge_read and state_schema[binding.state].type in {NodeSystemStateType.TEXT, NodeSystemStateType.MARKDOWN}
        ),
        None,
    )

    for skill_key in node.config.skills:
        skill_func = registry.get(skill_key)
        if skill_func is None:
            raise ValueError(f"Skill '{skill_key}' is not registered.")

        if skill_key == KNOWLEDGE_BASE_SKILL_KEY:
            skill_inputs = {
                "knowledge_base": input_values.get(knowledge_read) if knowledge_read else None,
                "query": input_values.get(query_read) if query_read else None,
            }
        else:
            skill_inputs = dict(input_values)

        skill_result = _invoke_skill(skill_func, skill_inputs)
        selected_skills.append(skill_key)
        skill_context[skill_key] = skill_result
        skill_outputs.append(
            {
                "skill_name": skill_key,
                "skill_key": skill_key,
                "inputs": skill_inputs,
                "outputs": skill_result,
            }
        )

    response_payload, response_reasoning, response_warnings, runtime_config = _generate_agent_response(
        node,
        input_values,
        skill_context,
        runtime_config,
    )
    warnings.extend(response_warnings)

    output_keys = [binding.state for binding in node.writes]
    output_values = {
        state_name: response_payload.get(state_name)
        for state_name in output_keys
    }

    return {
        "outputs": output_values,
        "response": response_payload,
        "reasoning": response_reasoning,
        "selected_skills": selected_skills,
        "skill_outputs": skill_outputs,
        "runtime_config": runtime_config,
        "warnings": list(dict.fromkeys(warnings)),
        "final_result": _first_truthy(output_values.values()) or response_payload.get("summary") or "",
    }


def _execute_output_node(
    node_name: str,
    node: NodeSystemOutputNode,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    binding = node.reads[0]
    value = input_values.get(binding.state)
    preview = {
        "node_id": node_name,
        "label": binding.state,
        "source_kind": "state",
        "source_key": binding.state,
        "display_mode": node.config.display_mode.value,
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
                source_key=binding.state,
                value=value,
                persist_format=node.config.persist_format.value,
                file_name_template=node.config.file_name_template or binding.state,
            )
        )
    return {
        "outputs": {binding.state: value},
        "output_previews": [preview],
        "saved_outputs": saved_outputs,
        "final_result": "" if value is None else str(value),
    }


def _execute_condition_node(
    node: NodeSystemConditionNode,
    input_values: dict[str, Any],
    graph_context: dict[str, Any],
) -> dict[str, Any]:
    rule_value = _resolve_condition_source(
        node.config.rule.source,
        inputs=input_values,
        graph=graph_context,
        state_values=graph_context.get("state", {}),
    )
    condition_result = _evaluate_condition_rule(rule_value, node.config.rule.operator.value, node.config.rule.value)
    branch_key = _resolve_branch_key(node.config.branches, node.config.branch_mapping, condition_result)
    if branch_key is None:
        raise ValueError("Condition node could not resolve a target branch.")

    return {
        "outputs": {branch_key: True},
        "selected_branch": branch_key,
        "final_result": branch_key,
    }


def _resolve_condition_source(
    source: str,
    *,
    inputs: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if source.startswith("$"):
        return _resolve_reference(
            source,
            inputs=inputs,
            response={},
            skills={},
            context={},
            graph=graph,
            state_values=state_values,
        )
    if source in inputs:
        return inputs[source]
    if source in state_values:
        return state_values[source]
    return source


def _generate_agent_response(
    node: NodeSystemAgentNode,
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
    runtime_config: dict[str, Any],
) -> tuple[dict[str, Any], str, list[str], dict[str, Any]]:
    output_keys = [binding.state for binding in node.writes]
    if not output_keys:
        return {"summary": ""}, "", [], runtime_config

    system_prompt = (
        node.config.system_instruction
        if node.config.system_instruction
        else _build_auto_system_prompt(output_keys, input_values, skill_context)
    )
    user_prompt = (
        node.config.task_instruction
        if node.config.task_instruction
        else "根据输入和技能结果完成输出。"
    )

    content, llm_meta = _chat_with_local_model_with_meta(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=runtime_config["runtime_model_name"],
        provider_id=runtime_config["resolved_provider_id"],
        temperature=runtime_config["resolved_temperature"],
        thinking_enabled=runtime_config["resolved_thinking"],
    )

    parsed_fields = _parse_llm_json_response(content, output_keys)
    response_payload: dict[str, Any] = {"summary": content, **parsed_fields}
    reasoning = str(llm_meta.get("reasoning") or "").strip()
    updated_runtime_config = {
        **runtime_config,
        "provider_model": llm_meta.get("model", runtime_config["runtime_model_name"]),
        "provider_id": llm_meta.get("provider_id", runtime_config["resolved_provider_id"]),
        "provider_temperature": llm_meta.get("temperature", runtime_config["resolved_temperature"]),
        "provider_reasoning_format": llm_meta.get("reasoning_format"),
        "provider_thinking_enabled": bool(llm_meta.get("thinking_enabled")),
        "provider_reasoning_captured": bool(reasoning),
        "provider_response_id": llm_meta.get("response_id"),
        "provider_usage": llm_meta.get("usage"),
        "provider_timings": llm_meta.get("timings"),
    }
    return response_payload, reasoning, llm_meta.get("warnings", []), updated_runtime_config


def _build_auto_system_prompt(
    output_keys: list[str],
    input_values: dict[str, Any],
    skill_context: dict[str, Any],
) -> str:
    parts = [
        "你是一个工作流处理节点。根据输入和技能结果完成用户的任务指令。",
        "严格返回一个 JSON 对象，不要加 markdown 围栏或任何前缀。",
    ]

    if input_values:
        parts.append("\n== Graph State Inputs ==")
        for key, value in input_values.items():
            display = str(value)
            if len(display) > 200:
                display = display[:200] + "..."
            parts.append(f"- {key}: {display}")

    if skill_context:
        parts.append("\n== Skill Results ==")
        for skill_key, result in skill_context.items():
            parts.append(f"[{skill_key}]")
            if isinstance(result, dict):
                for result_key, result_value in result.items():
                    display = str(result_value)
                    if len(display) > 300:
                        display = display[:300] + "..."
                    parts.append(f"  {result_key}: {display}")
            else:
                parts.append(f"  {result}")

    example = json.dumps({key: "..." for key in output_keys}, ensure_ascii=False)
    parts.append("\n== 必须返回的 JSON 格式 ==")
    parts.append(example)
    parts.append("每个字段填入最合适的值。")
    return "\n".join(parts)


def _resolve_agent_runtime_config(node: NodeSystemAgentNode) -> dict[str, Any]:
    global_model_ref = get_default_text_model_ref()
    global_thinking_enabled = get_default_agent_thinking_enabled()
    default_temperature = get_default_agent_temperature()
    override_model_ref = normalize_model_ref(node.config.model) if node.config.model.strip() else ""

    resolved_model = (
        override_model_ref
        if node.config.model_source.value == "override" and override_model_ref
        else global_model_ref
    )
    resolved_thinking = node.config.thinking_mode.value == "on"
    resolved_temperature = max(0.0, min(float(node.config.temperature), 2.0))
    resolved_provider_id, _resolved_model_name = resolved_model.split("/", 1) if "/" in resolved_model else ("local", resolved_model)
    runtime_model_name = resolve_runtime_model_name(resolved_model)

    return {
        "model_source": node.config.model_source.value,
        "configured_model_ref": override_model_ref,
        "thinking_mode": node.config.thinking_mode.value,
        "configured_temperature": node.config.temperature,
        "global_model_ref": global_model_ref,
        "global_thinking_enabled": global_thinking_enabled,
        "default_temperature": default_temperature,
        "resolved_model_ref": resolved_model,
        "resolved_provider_id": resolved_provider_id,
        "resolved_thinking": resolved_thinking,
        "resolved_temperature": resolved_temperature,
        "runtime_model_name": runtime_model_name,
        "request_return_progress": resolved_thinking and resolved_provider_id == "local",
        "request_reasoning_format": "auto" if resolved_thinking and resolved_provider_id == "local" else None,
    }


def _invoke_skill(skill_func: Any, skill_inputs: dict[str, Any]) -> dict[str, Any]:
    signature = inspect.signature(skill_func)
    parameters = list(signature.parameters.values())
    if len(parameters) >= 2:
        return skill_func({}, skill_inputs)
    return skill_func(**skill_inputs)


def _resolve_reference(
    reference: str,
    *,
    inputs: dict[str, Any],
    response: dict[str, Any],
    skills: dict[str, Any],
    context: dict[str, Any],
    graph: dict[str, Any],
    state_values: dict[str, Any],
) -> Any:
    if not isinstance(reference, str) or not reference.startswith("$"):
        return reference
    if reference.startswith("$inputs."):
        return _read_path(inputs, reference[len("$inputs."):])
    if reference.startswith("$response."):
        return _read_path(response, reference[len("$response."):])
    if reference.startswith("$skills."):
        return _read_path(skills, reference[len("$skills."):])
    if reference.startswith("$context."):
        return _read_path(context, reference[len("$context."):])
    if reference.startswith("$state."):
        return _read_path(state_values, reference[len("$state."):])
    if reference.startswith("$graph."):
        return _read_path(graph, reference[len("$graph."):])
    return reference


def _evaluate_condition_rule(left_value: Any, operator: str, right_value: Any) -> bool:
    if operator == "exists":
        return left_value not in (None, "", [], {})
    if operator == "==":
        return left_value == right_value
    if operator == "!=":
        return left_value != right_value
    if operator == ">":
        return left_value > right_value
    if operator == "<":
        return left_value < right_value
    if operator == ">=":
        return left_value >= right_value
    if operator == "<=":
        return left_value <= right_value
    raise ValueError(f"Unsupported condition operator '{operator}'.")


def _resolve_branch_key(branches: list[str], branch_mapping: dict[str, str], condition_result: Any) -> str | None:
    lookup_keys = [
        str(condition_result).lower(),
        str(condition_result),
    ]
    for lookup_key in lookup_keys:
        if lookup_key in branch_mapping:
            return branch_mapping[lookup_key]

    if isinstance(condition_result, bool):
        bool_key = "true" if condition_result else "false"
        if bool_key in branches:
            return bool_key
        if len(branches) >= 2:
            return branches[0] if condition_result else branches[1]

    normalized_matches = {branch.lower(): branch for branch in branches}
    for lookup_key in lookup_keys:
        if lookup_key.lower() in normalized_matches:
            return normalized_matches[lookup_key.lower()]
    return None


def _select_active_outgoing_edges(outgoing_edges: list[ExecutionEdge], body: dict[str, Any]) -> set[str]:
    selected_branch = body.get("selected_branch")
    active_edges: set[str] = set()
    for edge in outgoing_edges:
        if edge.kind == "conditional":
            if selected_branch and edge.branch == selected_branch:
                active_edges.add(edge.id)
            continue
        active_edges.add(edge.id)
    return active_edges


def _parse_llm_json_response(content: str, output_keys: list[str]) -> dict[str, Any]:
    if not content:
        return {key: "" for key in output_keys}
    cleaned = re.sub(r"^\s*```(?:json)?\s*\n?", "", content)
    cleaned = re.sub(r"\n?\s*```\s*$", "", cleaned).strip()

    candidate_payloads = [cleaned]
    json_start = cleaned.find("{")
    json_end = cleaned.rfind("}")
    if json_start != -1 and json_end > json_start:
        candidate_payloads.append(cleaned[json_start : json_end + 1].strip())

    for candidate in candidate_payloads:
        try:
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return {key: parsed.get(key) for key in output_keys}
        except json.JSONDecodeError:
            continue

    key_value_matches: dict[str, str] = {}
    for line in cleaned.splitlines():
        match = re.match(r'^\s*["\']?([A-Za-z0-9_\-]+)["\']?\s*[:：]\s*(.+?)\s*$', line)
        if not match:
            continue
        key, value = match.groups()
        if key in output_keys:
            key_value_matches[key] = value.strip().strip('"').strip("'")

    if key_value_matches:
        return {
            key: key_value_matches.get(key, "")
            for key in output_keys
        }

    if len(output_keys) == 1:
        key = output_keys[0]
        single_match = re.match(rf'^\s*{re.escape(key)}\s*[:：]\s*(.+?)\s*$', cleaned, flags=re.IGNORECASE | re.DOTALL)
        if single_match:
            return {key: single_match.group(1).strip()}

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return {key: parsed.get(key) for key in output_keys}
    except json.JSONDecodeError:
        pass
    return {key: cleaned for key in output_keys}


def _build_regular_edge_id(edge: NodeSystemGraphEdge) -> str:
    return f"edge:{edge.source}:{edge.source_handle}->{edge.target}:{edge.target_handle}"


def _build_conditional_edge_id(source: str, branch: str, target: str) -> str:
    return f"conditional:{source}:{branch}->{target}"


def _parse_handle_state(handle: str) -> str | None:
    if ":" not in handle:
        return None
    _prefix, state_name = handle.split(":", 1)
    return state_name


def _build_knowledge_summary(skill_outputs: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for skill_output in skill_outputs:
        if skill_output.get("skill_key") != KNOWLEDGE_BASE_SKILL_KEY:
            continue
        outputs = skill_output.get("outputs") or {}
        knowledge_base = outputs.get("knowledge_base") or "unknown"
        query = outputs.get("query") or ""
        citations = outputs.get("citations") or []
        header = f"Knowledge Base: {knowledge_base}"
        if query:
            header += f"\nQuery: {query}"
        lines.append(header)
        if citations:
            for citation in citations[:6]:
                lines.append(
                    f"- {citation.get('title') or 'Untitled'}"
                    f" | {citation.get('section') or 'Overview'}"
                    f" | {citation.get('url') or citation.get('source') or ''}"
                )
        else:
            lines.append("- No citations returned.")
    return "\n\n".join(lines).strip()


def _read_path(payload: Any, path: str) -> Any:
    current = payload
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


def _summarize_inputs(input_values: dict[str, Any]) -> str:
    if not input_values:
        return "no inputs"
    return str({key: str(value)[:80] for key, value in input_values.items()})[:160]


def _summarize_outputs(output_values: dict[str, Any], final_result: Any) -> str:
    if final_result:
        return str(final_result)[:160]
    if output_values:
        return str({key: str(value)[:80] for key, value in output_values.items()})[:160]
    return "no outputs"


def _first_truthy(values: Any) -> Any:
    for value in values:
        if value:
            return value
    return None


def _coerce_input_boundary_value(value: Any, state_type: NodeSystemStateType) -> Any:
    if not isinstance(value, str):
        return value

    try:
        parsed = json.loads(value)
        if state_type in {NodeSystemStateType.NUMBER, NodeSystemStateType.BOOLEAN, NodeSystemStateType.OBJECT, NodeSystemStateType.ARRAY, NodeSystemStateType.JSON, NodeSystemStateType.FILE_LIST}:
            return parsed
        if state_type in {NodeSystemStateType.IMAGE, NodeSystemStateType.AUDIO, NodeSystemStateType.VIDEO, NodeSystemStateType.FILE} and isinstance(parsed, dict) and parsed.get("kind") == "uploaded_file":
            return parsed
        if state_type == NodeSystemStateType.KNOWLEDGE_BASE:
            return value
        return value
    except json.JSONDecodeError:
        return value

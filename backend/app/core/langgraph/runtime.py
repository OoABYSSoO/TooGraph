from __future__ import annotations

import time
import threading
import copy
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from app.core.langgraph.checkpoints import JsonCheckpointSaver
from app.core.langgraph.checkpoint_runtime import (
    build_checkpoint_runtime as _build_checkpoint_runtime,
    sync_checkpoint_metadata as _sync_checkpoint_metadata,
)
from app.core.langgraph.compiler import compile_graph_to_langgraph_plan
from app.core.langgraph.cycle_tracker import (
    advance_condition_loop_iterations as _advance_condition_loop_iterations,
    build_langgraph_cycle_tracker as _build_langgraph_cycle_tracker,
    check_condition_loop_limit as _check_condition_loop_limit,
    collect_condition_loop_limits as _collect_condition_loop_limits,
    current_cycle_iteration as _current_cycle_iteration,
    ensure_cycle_iteration_record as _ensure_cycle_iteration_record,
    finalize_langgraph_cycle_summary as _finalize_langgraph_cycle_summary,
    mark_cycle_iteration_stop_reason as _mark_cycle_iteration_stop_reason,
    peek_condition_loop_limit_violation as _peek_condition_loop_limit_violation,
    record_cycle_activity as _record_cycle_activity,
    record_cycle_route_activity as _record_cycle_route_activity,
    resolve_cycle_summary_max_iterations as _resolve_cycle_summary_max_iterations,
    serialize_cycle_records as _serialize_cycle_records,
)
from app.core.langgraph.finalization import (
    finalize_completed_langgraph_state as _finalize_completed_langgraph_state,
    finalize_failed_langgraph_state as _finalize_failed_langgraph_state,
)
from app.core.langgraph.interrupts import (
    AFTER_BREAKPOINT_NODE_PREFIX,
    after_breakpoint_node_name as _after_breakpoint_node_name,
    apply_waiting_state as _apply_waiting_state,
    is_waiting_for_human as _is_waiting_for_human,
    resolve_interrupt_configuration as _resolve_interrupt_configuration,
    serialize_pending_interrupts as _serialize_pending_interrupts,
    snapshot_has_interrupt_payload as _snapshot_has_interrupt_payload,
    source_node_from_after_breakpoint as _source_node_from_after_breakpoint,
)
from app.core.langgraph.progress import persist_langgraph_progress as _persist_langgraph_progress
from app.core.langgraph.runtime_setup import (
    build_after_breakpoint_node_map as _build_after_breakpoint_node_map,
    build_after_breakpoint_passthrough_callable as _build_after_breakpoint_passthrough_callable,
    build_compiled_interrupt_before as _build_compiled_interrupt_before,
    build_langgraph_execution_edge_indexes as _build_langgraph_execution_edge_indexes,
    build_langgraph_state_schema as _build_langgraph_state_schema,
    prepare_langgraph_runtime_state as _prepare_langgraph_runtime_state,
    runtime_graph_endpoint as _runtime_graph_endpoint,
)
from app.core.runtime.execution_graph import (
    build_execution_edges,
    select_active_outgoing_edges,
)
from app.core.runtime.runtime_summaries import summarize_first_value as _summarize_values
from app.core.runtime.state_io import apply_state_writes, collect_node_inputs
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.node_system_executor import (
    _execute_node,
)
from app.core.runtime.state import set_run_status, touch_run_lifecycle, utc_now_iso
from app.core.schemas.node_system import NodeSystemGraphDocument, NodeSystemInputNode, NodeSystemOutputNode, NodeSystemSubgraphNode
from app.core.storage.run_store import save_run


def execute_node_system_graph_langgraph(
    graph: NodeSystemGraphDocument,
    initial_state: dict[str, Any] | None = None,
    *,
    persist_progress: bool = False,
    resume_from_checkpoint: bool = False,
    resume_command: Any | None = None,
) -> dict[str, Any]:
    build_plan = compile_graph_to_langgraph_plan(graph)
    if build_plan.requirements.unsupported_reasons:
        raise NotImplementedError("; ".join(build_plan.requirements.unsupported_reasons))

    started_perf = time.perf_counter()
    state = _prepare_langgraph_runtime_state(
        graph,
        initial_state,
        resume_from_checkpoint=resume_from_checkpoint,
    )
    checkpoint_saver, runtime_config, checkpoint_lookup_config = _build_checkpoint_runtime(graph=graph, state=state)

    execution_edges = build_execution_edges(graph)
    outgoing_edges_by_source, conditional_edge_ids = _build_langgraph_execution_edge_indexes(execution_edges)
    cycle_tracker = _build_langgraph_cycle_tracker(graph, execution_edges)
    active_edge_ids: set[str] = set()
    node_outputs: dict[str, dict[str, Any]] = {}
    run_lock = threading.Lock()

    if persist_progress:
        _persist_langgraph_progress(
            state,
            node_outputs,
            active_edge_ids,
            started_perf=started_perf,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
        )

    if not build_plan.runtime_nodes and not build_plan.runtime_condition_routes:
        return _finalize_completed_langgraph_state(
            graph,
            state,
            active_edge_ids,
            cycle_tracker,
            node_outputs,
            started_perf=started_perf,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
            append_snapshot=False,
            save_run_func=save_run,
        )

    workflow = StateGraph(_build_langgraph_state_schema(graph))
    for node_name in build_plan.runtime_nodes:
        workflow.add_node(
            node_name,
            _build_langgraph_node_callable(
                graph=graph,
                node_name=node_name,
                state=state,
                node_outputs=node_outputs,
                active_edge_ids=active_edge_ids,
                outgoing_edges=outgoing_edges_by_source.get(node_name, []),
                cycle_tracker=cycle_tracker,
                persist_progress=persist_progress,
                started_perf=started_perf,
                run_lock=run_lock,
                checkpoint_saver=checkpoint_saver,
                checkpoint_lookup_config=checkpoint_lookup_config,
            ),
        )

    interrupt_before, interrupt_after = _resolve_interrupt_configuration(graph, allowed_nodes=set(build_plan.runtime_nodes))
    after_breakpoint_nodes = _build_after_breakpoint_node_map(
        interrupt_after,
        runtime_nodes=set(build_plan.runtime_nodes),
        after_breakpoint_node_name_func=_after_breakpoint_node_name,
    )
    for breakpoint_node_name in after_breakpoint_nodes.values():
        workflow.add_node(breakpoint_node_name, _build_after_breakpoint_passthrough_callable())

    for node_name in build_plan.requirements.runtime_entry_nodes:
        workflow.add_edge(START, node_name)
    for node_name, breakpoint_node_name in after_breakpoint_nodes.items():
        workflow.add_edge(node_name, breakpoint_node_name)
    for edge in build_plan.runtime_edges:
        workflow.add_edge(after_breakpoint_nodes.get(edge.source, edge.source), edge.target)
    for route in build_plan.runtime_condition_routes:
        workflow.add_conditional_edges(
            after_breakpoint_nodes.get(_runtime_graph_endpoint(route.source), _runtime_graph_endpoint(route.source)),
            _build_langgraph_route_callable(
                graph=graph,
                route=route,
                state=state,
                node_outputs=node_outputs,
                active_edge_ids=active_edge_ids,
                conditional_edge_ids=conditional_edge_ids,
                cycle_tracker=cycle_tracker,
                persist_progress=persist_progress,
                started_perf=started_perf,
                run_lock=run_lock,
                checkpoint_saver=checkpoint_saver,
                checkpoint_lookup_config=checkpoint_lookup_config,
            ),
            path_map={branch: _runtime_graph_endpoint(target) for branch, target in route.branches.items()},
        )
    for node_name in build_plan.requirements.runtime_terminal_nodes:
        workflow.add_edge(after_breakpoint_nodes.get(node_name, node_name), END)

    compiled_interrupt_before = _build_compiled_interrupt_before(interrupt_before, after_breakpoint_nodes)
    compiled = workflow.compile(
        checkpointer=checkpoint_saver,
        interrupt_before=compiled_interrupt_before,
        interrupt_after=None,
    )

    try:
        if resume_from_checkpoint:
            if checkpoint_saver.get_tuple(checkpoint_lookup_config) is None:
                raise ValueError("No LangGraph checkpoint is available for this run.")
            snapshot = compiled.get_state(runtime_config)
            resume_runtime_config: dict[str, Any] = checkpoint_lookup_config
            if _snapshot_has_interrupt_payload(snapshot):
                result_state = compiled.invoke(Command(resume=resume_command), config=resume_runtime_config)
            else:
                if isinstance(resume_command, dict) and resume_command:
                    resume_runtime_config = compiled.update_state(checkpoint_lookup_config, resume_command)
                result_state = compiled.invoke(None, config=resume_runtime_config)
        else:
            result_state = compiled.invoke(dict(state.get("state_values", {})), config=runtime_config)
        state["state_values"] = dict(result_state)
        snapshot = compiled.get_state(checkpoint_lookup_config)
        if _is_waiting_for_human(snapshot):
            _apply_waiting_state(
                state,
                snapshot,
                graph=graph,
                checkpoint_saver=checkpoint_saver,
                checkpoint_lookup_config=checkpoint_lookup_config,
                started_perf=started_perf,
                node_outputs=node_outputs,
                active_edge_ids=active_edge_ids,
            )
            save_run(state)
            return state
        return _finalize_completed_langgraph_state(
            graph,
            state,
            active_edge_ids,
            cycle_tracker,
            node_outputs,
            started_perf=started_perf,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
            append_snapshot=True,
            save_run_func=save_run,
        )
    except Exception as exc:  # pragma: no cover - defensive runtime path
        _finalize_failed_langgraph_state(
            state,
            node_outputs,
            active_edge_ids,
            exc=exc,
            started_perf=started_perf,
            checkpoint_saver=checkpoint_saver,
            checkpoint_lookup_config=checkpoint_lookup_config,
            save_run_func=save_run,
        )
        raise


def _build_langgraph_node_callable(
    *,
    graph: NodeSystemGraphDocument,
    node_name: str,
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    outgoing_edges: list[Any],
    cycle_tracker: dict[str, Any],
    persist_progress: bool,
    started_perf: float,
    run_lock: threading.Lock,
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
):
    node = graph.nodes[node_name]

    def _call(current_values: dict[str, Any]) -> dict[str, Any]:
        with run_lock:
            node_started_perf = time.perf_counter()
            state["current_node_id"] = node_name
            state["node_status_map"][node_name] = "running"
            touch_run_lifecycle(state)
            state["state_values"] = {
                **dict(state.get("state_values", {})),
                **dict(current_values or {}),
            }
            publish_run_event(
                str(state.get("run_id") or ""),
                "node.started",
                {
                    "node_id": node_name,
                    "node_type": node.kind,
                    "status": "running",
                    "started_at": utc_now_iso(),
                },
            )
            if persist_progress:
                _persist_langgraph_progress(
                    state,
                    node_outputs,
                    active_edge_ids,
                    started_perf=started_perf,
                    checkpoint_saver=checkpoint_saver,
                    checkpoint_lookup_config=checkpoint_lookup_config,
                )

            try:
                iteration = _current_cycle_iteration(cycle_tracker)
                input_values, state_reads = collect_node_inputs(node, state)
                if isinstance(node, NodeSystemSubgraphNode):
                    body = _execute_subgraph_node_runtime(graph, node_name, node, input_values, state)
                else:
                    body = _execute_node(graph, node_name, node, input_values, state)
                outputs = dict(body.get("outputs", {}))
                selected_edge_ids = select_active_outgoing_edges(outgoing_edges, body)
                duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
                node_outputs[node_name] = outputs
                state_writes = apply_state_writes(node_name, node.writes, outputs, state)
                graph_updates = {write["state_key"]: write["value"] for write in state_writes}
                for write in state_writes:
                    publish_run_event(
                        str(state.get("run_id") or ""),
                        "state.updated",
                        {
                            "node_id": node_name,
                            "node_type": node.kind,
                            "state_key": write["state_key"],
                            "output_key": write["output_key"],
                            "mode": write.get("mode", "replace"),
                            "value": write.get("value"),
                            "previous_value": write.get("previous_value"),
                            "changed": bool(write.get("changed")),
                            "sequence": write.get("sequence"),
                        },
                    )
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
                        "input_summary": _summarize_values(input_values),
                        "output_summary": _summarize_values(outputs, body.get("final_result")),
                        "artifacts": {
                            "inputs": input_values,
                            "outputs": outputs,
                            "family": node.kind,
                            "iteration": iteration,
                            "subgraph": body.get("subgraph"),
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
                active_edge_ids.update(selected_edge_ids)
                _record_cycle_activity(
                    state=state,
                    cycle_tracker=cycle_tracker,
                    iteration=iteration,
                    node_name=node_name,
                    selected_edge_ids=selected_edge_ids,
                    state_writes=state_writes,
                )
                publish_run_event(
                    str(state.get("run_id") or ""),
                    "node.completed",
                    {
                        "node_id": node_name,
                        "node_type": node.kind,
                        "status": "success",
                        "duration_ms": duration_ms,
                        "output_keys": list(outputs.keys()),
                    },
                )
                if persist_progress:
                    _persist_langgraph_progress(
                        state,
                        node_outputs,
                        active_edge_ids,
                        started_perf=started_perf,
                        checkpoint_saver=checkpoint_saver,
                        checkpoint_lookup_config=checkpoint_lookup_config,
                    )
                return graph_updates
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
                    _persist_langgraph_progress(
                        state,
                        node_outputs,
                        active_edge_ids,
                        started_perf=started_perf,
                        checkpoint_saver=checkpoint_saver,
                        checkpoint_lookup_config=checkpoint_lookup_config,
                    )
                publish_run_event(
                    str(state.get("run_id") or ""),
                    "node.failed",
                    {
                        "node_id": node_name,
                        "node_type": node.kind,
                        "status": "failed",
                        "duration_ms": duration_ms,
                        "error": str(exc),
                    },
                )
                raise

    return _call


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


def _build_subgraph_document(
    parent_graph: NodeSystemGraphDocument,
    node_name: str,
    node: NodeSystemSubgraphNode,
    input_values: dict[str, Any],
) -> NodeSystemGraphDocument:
    payload = node.config.graph.model_dump(by_alias=True, mode="json")
    state_schema = dict(payload.get("state_schema") or {})
    for index, (_inner_node_name, inner_state_key) in enumerate(_subgraph_input_boundaries(node)):
        external_binding = node.reads[index] if index < len(node.reads) else None
        if external_binding is None:
            raise ValueError(f"Subgraph node '{node_name}' is missing required input {index + 1}.")
        if inner_state_key not in state_schema:
            raise ValueError(f"Subgraph node '{node_name}' input boundary references unknown state '{inner_state_key}'.")
        state_schema[inner_state_key] = {
            **dict(state_schema[inner_state_key]),
            "value": copy.deepcopy(input_values.get(external_binding.state)),
        }
    payload["state_schema"] = state_schema
    return NodeSystemGraphDocument.model_validate(
        {
            **payload,
            "graph_id": f"{parent_graph.graph_id}_{node_name}_subgraph",
            "name": node.name or f"{node_name} Subgraph",
        }
    )


def _execute_subgraph_node_runtime(
    parent_graph: NodeSystemGraphDocument,
    node_name: str,
    node: NodeSystemSubgraphNode,
    input_values: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    subgraph_document = _build_subgraph_document(parent_graph, node_name, node, input_values)
    subgraph_state = execute_node_system_graph_langgraph(subgraph_document, persist_progress=False)
    output_values_by_internal_state = {
        internal_state_key: copy.deepcopy(subgraph_state.get("state_values", {}).get(internal_state_key))
        for _inner_node_name, internal_state_key in _subgraph_output_boundaries(node)
    }
    parent_outputs: dict[str, Any] = {}
    for index, (_inner_node_name, internal_state_key) in enumerate(_subgraph_output_boundaries(node)):
        external_binding = node.writes[index] if index < len(node.writes) else None
        if external_binding is None:
            raise ValueError(f"Subgraph node '{node_name}' is missing required output {index + 1}.")
        parent_outputs[external_binding.state] = copy.deepcopy(output_values_by_internal_state.get(internal_state_key))

    first_value = next((value for value in parent_outputs.values() if value not in (None, "", [], {})), "")
    return {
        "outputs": parent_outputs,
        "final_result": "" if first_value is None else str(first_value),
        "warnings": list(subgraph_state.get("warnings", [])),
        "subgraph": {
            "graph_id": subgraph_document.graph_id,
            "name": subgraph_document.name,
            "status": subgraph_state.get("status"),
            "node_status_map": dict(subgraph_state.get("node_status_map", {})),
            "input_values": {
                internal_state_key: copy.deepcopy(subgraph_document.state_schema[internal_state_key].value)
                for _inner_node_name, internal_state_key in _subgraph_input_boundaries(node)
            },
            "output_values": output_values_by_internal_state,
            "node_executions": list(subgraph_state.get("node_executions", [])),
            "errors": list(subgraph_state.get("errors", [])),
        },
    }


def _build_langgraph_route_callable(
    *,
    graph: NodeSystemGraphDocument,
    route: Any,
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    conditional_edge_ids: dict[tuple[str, str | None, str], str],
    cycle_tracker: dict[str, Any],
    persist_progress: bool,
    started_perf: float,
    run_lock: threading.Lock,
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
):
    conditional_edges_by_source = {
        conditional_edge.source: conditional_edge
        for conditional_edge in graph.conditional_edges
    }

    def _route_key_for_steps(selected_steps: list[tuple[str, str, str]]) -> str:
        for route_key, planned_steps in route.branch_paths.items():
            if [
                (str(step.condition), str(step.branch), str(step.target))
                for step in planned_steps
            ] == selected_steps:
                return str(route_key)
        rendered_path = " -> ".join(
            f"{condition_name}.{branch}->{target}"
            for condition_name, branch, target in selected_steps
        )
        raise ValueError(f"Condition route path is not compiled into the LangGraph plan: {rendered_path}")

    def _route(current_values: dict[str, Any]) -> str:
        with run_lock:
            state["state_values"] = {
                **dict(state.get("state_values", {})),
                **dict(current_values or {}),
            }
            iteration = _current_cycle_iteration(cycle_tracker)
            selected_edge_ids: set[str] = set()
            selected_steps: list[tuple[str, str, str]] = []
            visited_conditions: set[str] = set()
            condition_name = str(route.condition)

            while True:
                if condition_name in visited_conditions:
                    raise ValueError(f"Condition route contains a condition-only cycle at '{condition_name}'.")
                visited_conditions.add(condition_name)

                condition_node = graph.nodes[condition_name]
                state["node_status_map"][condition_name] = "running"
                try:
                    input_values, _state_reads = collect_node_inputs(condition_node, state)
                    body = _execute_node(graph, condition_name, condition_node, input_values, state)
                except Exception:
                    state["node_status_map"][condition_name] = "failed"
                    raise

                selected_branch = str(body.get("selected_branch") or "").strip()
                if not selected_branch:
                    state["node_status_map"][condition_name] = "failed"
                    raise ValueError(f"Condition node '{condition_name}' did not produce a selected branch.")

                conditional_edge = conditional_edges_by_source.get(condition_name)
                if conditional_edge is None:
                    state["node_status_map"][condition_name] = "failed"
                    raise ValueError(f"Condition node '{condition_name}' has no conditional edge mapping.")

                visual_target = str(conditional_edge.branches.get(selected_branch) or "")
                if not visual_target:
                    state["node_status_map"][condition_name] = "failed"
                    raise ValueError(
                        f"Condition node '{condition_name}' selected branch '{selected_branch}', but that branch has no target."
                    )

                current_step_edge_ids: set[str] = set()
                edge_id = conditional_edge_ids.get((condition_name, selected_branch, visual_target))
                if edge_id:
                    current_step_edge_ids.add(edge_id)

                loop_limit_violation = _peek_condition_loop_limit_violation(
                    cycle_tracker,
                    sorted(current_step_edge_ids),
                )
                if loop_limit_violation is not None:
                    max_iterations, source_node = loop_limit_violation
                    exhausted_visual_target = str(conditional_edge.branches.get("exhausted") or "")
                    exhausted_edge_id = conditional_edge_ids.get(
                        (condition_name, "exhausted", exhausted_visual_target)
                    )
                    if exhausted_visual_target and exhausted_edge_id:
                        selected_branch = "exhausted"
                        visual_target = exhausted_visual_target
                        current_step_edge_ids = {exhausted_edge_id}
                        _mark_cycle_iteration_stop_reason(cycle_tracker, iteration, "max_iterations_exceeded")
                        state["loop_limit_exhaustion"] = {
                            "condition_node": source_node,
                            "max_iterations": max_iterations,
                        }
                    else:
                        state["node_status_map"][condition_name] = "failed"
                        _mark_cycle_iteration_stop_reason(cycle_tracker, iteration, "max_iterations_exceeded")
                        raise ValueError(
                            f"Cycle execution exceeded loopLimit ({max_iterations}) for condition '{source_node}'. Add an exit branch or raise loopLimit."
                        )

                state["node_status_map"][condition_name] = "success"
                selected_steps.append((condition_name, selected_branch, visual_target))
                selected_edge_ids.update(current_step_edge_ids)

                target_node = graph.nodes.get(visual_target)
                if target_node is not None and target_node.kind == "condition":
                    condition_name = visual_target
                    continue

                route_key = _route_key_for_steps(selected_steps)
                active_edge_ids.update(selected_edge_ids)
                _record_cycle_route_activity(
                    state=state,
                    cycle_tracker=cycle_tracker,
                    iteration=iteration,
                    selected_edge_ids=selected_edge_ids,
                )
                if persist_progress:
                    _persist_langgraph_progress(
                        state,
                        node_outputs,
                        active_edge_ids,
                        started_perf=started_perf,
                        checkpoint_saver=checkpoint_saver,
                        checkpoint_lookup_config=checkpoint_lookup_config,
                    )
                return route_key

    return _route

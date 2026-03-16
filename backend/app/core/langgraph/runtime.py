from __future__ import annotations

import time
import threading
from collections import defaultdict
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
from app.core.langgraph.interrupts import (
    AFTER_BREAKPOINT_NODE_PREFIX,
    after_breakpoint_node_name as _after_breakpoint_node_name,
    apply_waiting_state as _apply_waiting_state,
    clear_pending_interrupt_metadata as _clear_pending_interrupt_metadata,
    is_waiting_for_human as _is_waiting_for_human,
    next_run_snapshot_id as _next_run_snapshot_id,
    resolve_interrupt_configuration as _resolve_interrupt_configuration,
    serialize_pending_interrupts as _serialize_pending_interrupts,
    snapshot_has_interrupt_payload as _snapshot_has_interrupt_payload,
    source_node_from_after_breakpoint as _source_node_from_after_breakpoint,
)
from app.core.langgraph.progress import persist_langgraph_progress as _persist_langgraph_progress
from app.core.langgraph.runtime_setup import (
    build_after_breakpoint_passthrough_callable as _build_after_breakpoint_passthrough_callable,
    build_langgraph_state_schema as _build_langgraph_state_schema,
    mark_input_boundaries_success as _mark_input_boundaries_success,
    runtime_graph_endpoint as _runtime_graph_endpoint,
)
from app.core.runtime.execution_graph import (
    build_execution_edges,
    select_active_outgoing_edges,
)
from app.core.runtime.output_boundaries import collect_output_boundaries
from app.core.runtime.run_artifacts import append_run_snapshot, refresh_run_artifacts
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.runtime_summaries import summarize_first_value as _summarize_values
from app.core.runtime.state_io import apply_state_writes, collect_node_inputs, initialize_graph_state
from app.core.runtime.node_system_executor import (
    _execute_node,
)
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle, utc_now_iso
from app.core.schemas.node_system import NodeSystemGraphDocument
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
    state = initial_state or create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    set_run_status(state, "running")
    state["runtime_backend"] = "langgraph"
    state.setdefault("started_at", utc_now_iso())
    state.pop("loop_limit_exhaustion", None)
    if resume_from_checkpoint:
        node_status_map = dict(state.get("node_status_map") or {})
        state["node_status_map"] = {
            node_name: node_status_map.get(node_name, "idle")
            for node_name in graph.nodes
        }
    else:
        state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    state["metadata"] = dict(graph.metadata)
    state["metadata"]["resolved_runtime_backend"] = "langgraph"
    initialize_graph_state(graph, state)
    _mark_input_boundaries_success(graph, state)
    checkpoint_saver, runtime_config, checkpoint_lookup_config = _build_checkpoint_runtime(graph=graph, state=state)

    execution_edges = build_execution_edges(graph)
    outgoing_edges_by_source: dict[str, list[Any]] = defaultdict(list)
    conditional_edge_ids: dict[tuple[str, str | None, str], str] = {}
    for edge in execution_edges:
        outgoing_edges_by_source[edge.source].append(edge)
        if edge.kind == "conditional":
            conditional_edge_ids[(edge.source, edge.branch, edge.target)] = edge.id
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
        _clear_pending_interrupt_metadata(state)
        set_run_status(state, "completed")
        state["current_node_id"] = None
        collect_output_boundaries(graph, state, active_edge_ids)
        _finalize_langgraph_cycle_summary(state, cycle_tracker, active_edge_ids)
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        save_run(state)
        publish_run_event(str(state.get("run_id") or ""), "run.completed", {"status": "completed"})
        return state

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
    after_breakpoint_nodes = {
        node_name: _after_breakpoint_node_name(node_name)
        for node_name in (interrupt_after or [])
        if node_name in build_plan.runtime_nodes
    }
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

    compiled_interrupt_before = sorted(set(interrupt_before or []) | set(after_breakpoint_nodes.values())) or None
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
        _clear_pending_interrupt_metadata(state)
        set_run_status(state, "completed")
        state["current_node_id"] = None
        collect_output_boundaries(graph, state, active_edge_ids)
        _finalize_langgraph_cycle_summary(state, cycle_tracker, active_edge_ids)
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        append_run_snapshot(
            state,
            snapshot_id=_next_run_snapshot_id(state, "completed"),
            kind="completed",
            label="Completed",
        )
        save_run(state)
        publish_run_event(str(state.get("run_id") or ""), "run.completed", {"status": "completed"})
        return state
    except Exception as exc:  # pragma: no cover - defensive runtime path
        set_run_status(state, "failed")
        state.setdefault("errors", []).append(str(exc))
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        append_run_snapshot(
            state,
            snapshot_id=_next_run_snapshot_id(state, "failed"),
            kind="failed",
            label="Failed",
        )
        save_run(state)
        publish_run_event(
            str(state.get("run_id") or ""),
            "run.failed",
            {"status": "failed", "error": str(exc)},
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
                body = _execute_node(graph, node_name, node, input_values, state)
                outputs = dict(body.get("outputs", {}))
                selected_edge_ids = select_active_outgoing_edges(outgoing_edges, body)
                duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
                node_outputs[node_name] = outputs
                state_writes = apply_state_writes(node_name, node.writes, outputs, state)
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
                if persist_progress:
                    _persist_langgraph_progress(
                        state,
                        node_outputs,
                        active_edge_ids,
                        started_perf=started_perf,
                        checkpoint_saver=checkpoint_saver,
                        checkpoint_lookup_config=checkpoint_lookup_config,
                    )
                return outputs
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
                raise

    return _call


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
    condition_name = route.condition
    condition_node = graph.nodes[condition_name]

    def _route(current_values: dict[str, Any]) -> str:
        with run_lock:
            state["node_status_map"][condition_name] = "running"
            state["state_values"] = {
                **dict(state.get("state_values", {})),
                **dict(current_values or {}),
            }
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
            state["node_status_map"][condition_name] = "success"
            visual_target = route.branch_targets.get(selected_branch, "")
            selected_edge_ids: set[str] = set()
            edge_id = conditional_edge_ids.get((condition_name, selected_branch, visual_target))
            if edge_id:
                selected_edge_ids.add(edge_id)
            iteration = _current_cycle_iteration(cycle_tracker)
            loop_limit_violation = _peek_condition_loop_limit_violation(cycle_tracker, sorted(selected_edge_ids))
            if loop_limit_violation is not None:
                max_iterations, source_node = loop_limit_violation
                exhausted_visual_target = route.branch_targets.get("exhausted", "")
                exhausted_edge_id = conditional_edge_ids.get((condition_name, "exhausted", exhausted_visual_target))
                if route.branches.get("exhausted") and exhausted_visual_target and exhausted_edge_id:
                    selected_branch = "exhausted"
                    selected_edge_ids = {exhausted_edge_id}
                    _mark_cycle_iteration_stop_reason(cycle_tracker, iteration, "max_iterations_exceeded")
                    state["loop_limit_exhaustion"] = {
                        "condition_node": source_node,
                        "max_iterations": max_iterations,
                    }
                else:
                    _mark_cycle_iteration_stop_reason(cycle_tracker, iteration, "max_iterations_exceeded")
                    raise ValueError(
                        f"Cycle execution exceeded loopLimit ({max_iterations}) for condition '{source_node}'. Add an exit branch or raise loopLimit."
                    )
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
            return selected_branch

    return _route

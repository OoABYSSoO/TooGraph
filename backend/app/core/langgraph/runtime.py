from __future__ import annotations

import time
import threading
from collections import defaultdict
from typing import Any
from typing import Annotated

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command
from typing_extensions import TypedDict

from app.core.langgraph.checkpoints import JsonCheckpointSaver
from app.core.langgraph.compiler import compile_graph_to_langgraph_plan
from app.core.runtime.node_system_executor import (
    CycleDetector,
    _apply_state_writes,
    _collect_node_inputs,
    _execute_node,
    _initialize_graph_state,
    _persist_run_progress,
    _refresh_run_artifacts,
    _select_active_outgoing_edges,
    _build_execution_edges,
    append_run_snapshot,
    collect_output_boundaries,
)
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle, utc_now_iso
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.storage.run_store import save_run

AFTER_BREAKPOINT_NODE_PREFIX = "__graphite_after_breakpoint__"


def _replace_reducer(_current: Any, update: Any) -> Any:
    return update


def _after_breakpoint_node_name(node_name: str) -> str:
    return f"{AFTER_BREAKPOINT_NODE_PREFIX}{node_name}"


def _source_node_from_after_breakpoint(node_name: str) -> str:
    if node_name.startswith(AFTER_BREAKPOINT_NODE_PREFIX):
        return node_name.removeprefix(AFTER_BREAKPOINT_NODE_PREFIX)
    return node_name


def _build_after_breakpoint_passthrough_callable():
    def _call(_current_values: dict[str, Any]) -> dict[str, Any]:
        return {}

    return _call


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
    _initialize_graph_state(graph, state)
    _mark_input_boundaries_success(graph, state)
    checkpoint_saver, runtime_config, checkpoint_lookup_config = _build_checkpoint_runtime(graph=graph, state=state)

    execution_edges = _build_execution_edges(graph)
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
        _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        save_run(state)
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
        _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        append_run_snapshot(
            state,
            snapshot_id=_next_run_snapshot_id(state, "completed"),
            kind="completed",
            label="Completed",
        )
        save_run(state)
        return state
    except Exception as exc:  # pragma: no cover - defensive runtime path
        set_run_status(state, "failed")
        state.setdefault("errors", []).append(str(exc))
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        append_run_snapshot(
            state,
            snapshot_id=_next_run_snapshot_id(state, "failed"),
            kind="failed",
            label="Failed",
        )
        save_run(state)
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
                input_values, state_reads = _collect_node_inputs(node, state)
                body = _execute_node(graph, node_name, node, input_values, state)
                outputs = dict(body.get("outputs", {}))
                selected_edge_ids = _select_active_outgoing_edges(outgoing_edges, body)
                duration_ms = int((time.perf_counter() - node_started_perf) * 1000)
                node_outputs[node_name] = outputs
                state_writes = _apply_state_writes(node_name, node.writes, outputs, state)
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


def _runtime_graph_endpoint(node_name: str) -> str:
    if node_name == "__start__":
        return START
    if node_name == "__end__":
        return END
    return node_name


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
                input_values, _state_reads = _collect_node_inputs(condition_node, state)
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


def _mark_input_boundaries_success(graph: NodeSystemGraphDocument, state: dict[str, Any]) -> None:
    node_status_map = state.setdefault("node_status_map", {})
    for node_name, node in graph.nodes.items():
        if node.kind == "input":
            node_status_map[node_name] = "success"


def _summarize_values(values: dict[str, Any], final_result: Any | None = None) -> str:
    if final_result not in (None, "", [], {}):
        return str(final_result)
    for value in values.values():
        if value not in (None, "", [], {}):
            return str(value)
    return ""


def _build_langgraph_state_schema(graph: NodeSystemGraphDocument):
    annotations = {
        state_name: Annotated[Any, _replace_reducer]
        for state_name in graph.state_schema
    }
    return TypedDict("GraphiteUILangGraphState", annotations, total=False)


def _build_checkpoint_runtime(
    *,
    graph: NodeSystemGraphDocument,
    state: dict[str, Any],
) -> tuple[JsonCheckpointSaver, dict[str, Any], dict[str, Any]]:
    checkpoint_metadata = dict(state.get("checkpoint_metadata", {}))
    thread_id = str(checkpoint_metadata.get("thread_id") or state.get("run_id") or "").strip()
    checkpoint_ns = str(checkpoint_metadata.get("checkpoint_ns") or "").strip()
    checkpoint_id = str(checkpoint_metadata.get("checkpoint_id") or "").strip()
    if not thread_id:
        raise ValueError("LangGraph runtime requires checkpoint_metadata.thread_id.")
    checkpoint_ns = checkpoint_ns or ""

    state.setdefault("checkpoint_metadata", {})
    state["checkpoint_metadata"].update(
        {
            "available": bool(checkpoint_id),
            "checkpoint_id": checkpoint_id or None,
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
            "saver": "json_checkpoint_saver",
        }
    )

    checkpoint_saver = JsonCheckpointSaver()
    runtime_config = {
        "configurable": {
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
        }
    }
    if checkpoint_id:
        runtime_config["configurable"]["checkpoint_id"] = checkpoint_id

    checkpoint_lookup_config = {
        "configurable": {
            "thread_id": thread_id,
            "checkpoint_ns": checkpoint_ns,
        }
    }
    return checkpoint_saver, runtime_config, checkpoint_lookup_config


def _sync_checkpoint_metadata(
    state: dict[str, Any],
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
) -> None:
    checkpoint_tuple = checkpoint_saver.get_tuple(checkpoint_lookup_config)
    checkpoint_metadata = state.setdefault("checkpoint_metadata", {})
    configurable = dict(checkpoint_lookup_config.get("configurable") or {})
    checkpoint_metadata["thread_id"] = configurable.get("thread_id")
    checkpoint_metadata["checkpoint_ns"] = configurable.get("checkpoint_ns")
    checkpoint_metadata["saver"] = "json_checkpoint_saver"
    if checkpoint_tuple is None:
        checkpoint_metadata["available"] = False
        checkpoint_metadata["checkpoint_id"] = None
        return
    checkpoint_metadata["available"] = True
    checkpoint_metadata["checkpoint_id"] = checkpoint_tuple.config.get("configurable", {}).get("checkpoint_id")


def _persist_langgraph_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
) -> None:
    _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
    _persist_run_progress(state, node_outputs, active_edge_ids, started_perf=started_perf)


def _resolve_interrupt_configuration(
    graph: NodeSystemGraphDocument,
    *,
    allowed_nodes: set[str] | None = None,
) -> tuple[list[str] | None, list[str] | None]:
    metadata = dict(graph.metadata or {})

    def _normalize(value: Any) -> list[str] | None:
        if value is None:
            return None
        if isinstance(value, str):
            items = [value]
        elif isinstance(value, list):
            items = [str(item).strip() for item in value]
        else:
            return None
        normalized = [item for item in items if item and (allowed_nodes is None or item in allowed_nodes)]
        return normalized or None

    interrupt_before = _normalize(metadata.get("interrupt_before"))
    if interrupt_before is None:
        interrupt_before = _normalize(metadata.get("interruptBefore"))
    interrupt_after = _normalize(metadata.get("interrupt_after"))
    if interrupt_after is None:
        interrupt_after = _normalize(metadata.get("interruptAfter"))
    return interrupt_before, interrupt_after


def _is_waiting_for_human(snapshot: Any) -> bool:
    if snapshot is None:
        return False
    if getattr(snapshot, "next", ()):
        return True
    return _snapshot_has_interrupt_payload(snapshot)


def _snapshot_has_interrupt_payload(snapshot: Any) -> bool:
    for task in getattr(snapshot, "tasks", ()) or ():
        if getattr(task, "interrupts", ()):
            return True
    return False


def _serialize_pending_interrupts(snapshot: Any) -> tuple[list[str], list[dict[str, Any]]]:
    pending_nodes: list[str] = []
    pending_interrupts: list[dict[str, Any]] = []

    for task in getattr(snapshot, "tasks", ()) or ():
        node_name = _source_node_from_after_breakpoint(str(getattr(task, "name", "") or "").strip())
        if node_name and node_name not in pending_nodes:
            pending_nodes.append(node_name)
        for interrupt in getattr(task, "interrupts", ()) or ():
            pending_interrupts.append(
                {
                    "node_id": node_name or None,
                    "interrupt_id": getattr(interrupt, "id", None),
                    "value": getattr(interrupt, "value", None),
                }
            )

    if not pending_nodes:
        pending_nodes = [
            _source_node_from_after_breakpoint(str(item).strip())
            for item in (getattr(snapshot, "next", ()) or ())
            if str(item).strip()
        ]

    return pending_nodes, pending_interrupts


def _apply_waiting_state(
    state: dict[str, Any],
    snapshot: Any,
    *,
    graph: NodeSystemGraphDocument,
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
    started_perf: float,
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
) -> None:
    state["state_values"] = dict(getattr(snapshot, "values", {}) or {})
    pending_nodes, pending_interrupts = _serialize_pending_interrupts(snapshot)
    pause_reason = "interrupt" if pending_interrupts else "breakpoint"
    set_run_status(state, "awaiting_human", pause_reason=pause_reason)
    state["current_node_id"] = pending_nodes[0] if pending_nodes else None
    node_status_map = state.setdefault("node_status_map", {})
    for node_name in pending_nodes:
        if node_status_map.get(node_name) != "success":
            node_status_map[node_name] = "paused"
    metadata = state.setdefault("metadata", {})
    metadata["pending_interrupt_nodes"] = pending_nodes
    metadata["pending_interrupts"] = pending_interrupts
    metadata["resolved_runtime_backend"] = "langgraph"
    if active_edge_ids:
        collect_output_boundaries(graph, state, active_edge_ids)
    _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
    append_run_snapshot(
        state,
        snapshot_id=_next_run_snapshot_id(state, "pause"),
        kind="pause",
        label=f"Paused at {state.get('current_node_id') or 'unknown'}",
    )


def _clear_pending_interrupt_metadata(state: dict[str, Any]) -> None:
    metadata = state.setdefault("metadata", {})
    metadata.pop("pending_interrupt_nodes", None)
    metadata.pop("pending_interrupts", None)


def _next_run_snapshot_id(state: dict[str, Any], kind: str) -> str:
    existing = [item for item in state.get("run_snapshots", []) if item.get("kind") == kind]
    return f"{kind}_{len(existing) + 1}"


def _build_langgraph_cycle_tracker(
    graph: NodeSystemGraphDocument,
    execution_edges: list[Any],
) -> dict[str, Any]:
    has_cycle, back_edges = CycleDetector(execution_edges).detect()
    back_edge_ids = {edge.id for edge in back_edges}
    back_edges_by_id = {edge.id: edge for edge in back_edges}
    loop_limits_by_source = _collect_condition_loop_limits(graph, back_edges)
    tracker = {
        "has_cycle": has_cycle,
        "back_edges": [f"{edge.source}→{edge.target}" for edge in back_edges],
        "back_edge_ids": back_edge_ids,
        "back_edges_by_id": back_edges_by_id,
        "loop_limits_by_source": loop_limits_by_source,
        "loop_iterations_by_source": {},
        "max_iterations": _resolve_cycle_summary_max_iterations(loop_limits_by_source) if has_cycle else 0,
        "current_iteration": 1,
        "records": {},
    }
    if has_cycle:
        _ensure_cycle_iteration_record(tracker, 1, [])
    return tracker


def _collect_condition_loop_limits(
    graph: NodeSystemGraphDocument,
    back_edges: list[Any],
) -> dict[str, int]:
    limits_by_source: dict[str, int] = {}
    for edge in back_edges:
        if edge.kind != "conditional":
            continue
        source_node = graph.nodes.get(edge.source)
        if not source_node or source_node.kind != "condition":
            continue
        limits_by_source[edge.source] = int(source_node.config.loop_limit)
    return limits_by_source


def _resolve_cycle_summary_max_iterations(loop_limits_by_source: dict[str, int]) -> int:
    if not loop_limits_by_source:
        return -1
    finite_limits = [limit for limit in loop_limits_by_source.values() if limit >= 1]
    if not finite_limits:
        return -1
    return min(finite_limits)


def _check_condition_loop_limit(
    cycle_tracker: dict[str, Any],
    next_iteration_edge_ids: list[str],
) -> tuple[int, str] | None:
    return _peek_condition_loop_limit_violation(cycle_tracker, next_iteration_edge_ids)


def _peek_condition_loop_limit_violation(
    cycle_tracker: dict[str, Any],
    next_iteration_edge_ids: list[str],
) -> tuple[int, str] | None:
    back_edges_by_id = cycle_tracker.get("back_edges_by_id", {})
    loop_limits_by_source = cycle_tracker.get("loop_limits_by_source", {})
    loop_iterations_by_source = cycle_tracker.setdefault("loop_iterations_by_source", {})

    for edge_id in next_iteration_edge_ids:
        edge = back_edges_by_id.get(edge_id)
        if edge is None:
            continue
        limit = int(loop_limits_by_source.get(edge.source, -1) or -1)
        if limit == -1:
            continue
        current_iteration = int(loop_iterations_by_source.get(edge.source, 1) or 1)
        next_iteration = current_iteration + 1
        if next_iteration > limit:
            return limit, edge.source
    return None


def _advance_condition_loop_iterations(
    cycle_tracker: dict[str, Any],
    next_iteration_edge_ids: list[str],
) -> None:
    back_edges_by_id = cycle_tracker.get("back_edges_by_id", {})
    loop_limits_by_source = cycle_tracker.get("loop_limits_by_source", {})
    loop_iterations_by_source = cycle_tracker.setdefault("loop_iterations_by_source", {})

    for edge_id in next_iteration_edge_ids:
        edge = back_edges_by_id.get(edge_id)
        if edge is None:
            continue
        limit = int(loop_limits_by_source.get(edge.source, -1) or -1)
        if limit == -1:
            continue
        current_iteration = int(loop_iterations_by_source.get(edge.source, 1) or 1)
        next_iteration = current_iteration + 1
        loop_iterations_by_source[edge.source] = next_iteration


def _current_cycle_iteration(cycle_tracker: dict[str, Any]) -> int:
    if not cycle_tracker.get("has_cycle"):
        return 1
    iteration = int(cycle_tracker.get("current_iteration", 1) or 1)
    _ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    return iteration


def _ensure_cycle_iteration_record(
    cycle_tracker: dict[str, Any],
    iteration: int,
    incoming_edge_ids: list[str],
) -> dict[str, Any]:
    records = cycle_tracker.setdefault("records", {})
    if iteration not in records:
        records[iteration] = {
            "iteration": iteration,
            "executed_node_ids": [],
            "incoming_edge_ids": sorted(set(incoming_edge_ids)),
            "activated_edge_ids": [],
            "next_iteration_edge_ids": [],
            "stop_reason": None,
            "_changed_state_keys": [],
        }
        return records[iteration]

    if incoming_edge_ids:
        records[iteration]["incoming_edge_ids"] = sorted(
            set(records[iteration].get("incoming_edge_ids", [])) | set(incoming_edge_ids)
        )
    return records[iteration]


def _mark_cycle_iteration_stop_reason(
    cycle_tracker: dict[str, Any],
    iteration: int,
    stop_reason: str,
) -> None:
    record = _ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    record["stop_reason"] = stop_reason


def _record_cycle_activity(
    *,
    state: dict[str, Any],
    cycle_tracker: dict[str, Any],
    iteration: int,
    node_name: str,
    selected_edge_ids: set[str],
    state_writes: list[dict[str, Any]],
) -> None:
    if not cycle_tracker.get("has_cycle"):
        return

    record = _ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    record["executed_node_ids"] = [*record.get("executed_node_ids", []), node_name]
    record["activated_edge_ids"] = sorted(set(record.get("activated_edge_ids", [])) | set(selected_edge_ids))
    changed_state_keys = {
        str(write.get("state_key"))
        for write in state_writes
        if write.get("changed") and write.get("state_key")
    }
    if changed_state_keys:
        record["_changed_state_keys"] = sorted(
            set(record.get("_changed_state_keys", [])) | changed_state_keys
        )

    back_edge_ids = set(cycle_tracker.get("back_edge_ids", set()))
    next_iteration_edge_ids = sorted(edge_id for edge_id in selected_edge_ids if edge_id in back_edge_ids)
    if not next_iteration_edge_ids:
        return

    record["next_iteration_edge_ids"] = sorted(
        set(record.get("next_iteration_edge_ids", [])) | set(next_iteration_edge_ids)
    )
    if not record.get("_changed_state_keys"):
        record["stop_reason"] = "no_state_change"
        state["cycle_summary"] = {
            "has_cycle": True,
            "back_edges": list(cycle_tracker.get("back_edges", [])),
            "iteration_count": iteration,
            "max_iterations": int(cycle_tracker.get("max_iterations", 0) or 0),
            "stop_reason": "no_state_change",
        }
        state["cycle_iterations"] = _serialize_cycle_records(cycle_tracker, final_stop_reason="no_state_change")
        raise RuntimeError(
            f"Cycle execution made no state progress in iteration {iteration}. Add an exit branch or update a state value inside the loop."
        )

    loop_limit_violation = _peek_condition_loop_limit_violation(cycle_tracker, next_iteration_edge_ids)
    if loop_limit_violation is not None:
        max_iterations, source_node = loop_limit_violation
        record["stop_reason"] = "max_iterations_exceeded"
        state["cycle_summary"] = {
            "has_cycle": True,
            "back_edges": list(cycle_tracker.get("back_edges", [])),
            "iteration_count": iteration,
            "max_iterations": max_iterations,
            "stop_reason": "max_iterations_exceeded",
        }
        state["cycle_iterations"] = _serialize_cycle_records(cycle_tracker, final_stop_reason="max_iterations_exceeded")
        raise ValueError(
            f"Cycle execution exceeded loopLimit ({max_iterations}) for condition '{source_node}'. Add an exit branch or raise loopLimit."
        )

    _advance_condition_loop_iterations(cycle_tracker, next_iteration_edge_ids)
    next_iteration = iteration + 1
    cycle_tracker["current_iteration"] = next_iteration
    _ensure_cycle_iteration_record(cycle_tracker, next_iteration, next_iteration_edge_ids)


def _record_cycle_route_activity(
    *,
    state: dict[str, Any],
    cycle_tracker: dict[str, Any],
    iteration: int,
    selected_edge_ids: set[str],
) -> None:
    if not cycle_tracker.get("has_cycle"):
        return

    record = _ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    record["activated_edge_ids"] = sorted(set(record.get("activated_edge_ids", [])) | set(selected_edge_ids))

    back_edge_ids = set(cycle_tracker.get("back_edge_ids", set()))
    next_iteration_edge_ids = sorted(edge_id for edge_id in selected_edge_ids if edge_id in back_edge_ids)
    if not next_iteration_edge_ids:
        return

    record["next_iteration_edge_ids"] = sorted(
        set(record.get("next_iteration_edge_ids", [])) | set(next_iteration_edge_ids)
    )
    if not record.get("_changed_state_keys"):
        record["stop_reason"] = "no_state_change"
        state["cycle_summary"] = {
            "has_cycle": True,
            "back_edges": list(cycle_tracker.get("back_edges", [])),
            "iteration_count": iteration,
            "max_iterations": int(cycle_tracker.get("max_iterations", 0) or 0),
            "stop_reason": "no_state_change",
        }
        state["cycle_iterations"] = _serialize_cycle_records(cycle_tracker, final_stop_reason="no_state_change")
        raise RuntimeError(
            f"Cycle execution made no state progress in iteration {iteration}. Add an exit branch or update a state value inside the loop."
        )

    loop_limit_violation = _peek_condition_loop_limit_violation(cycle_tracker, next_iteration_edge_ids)
    if loop_limit_violation is not None:
        max_iterations, source_node = loop_limit_violation
        record["stop_reason"] = "max_iterations_exceeded"
        state["cycle_summary"] = {
            "has_cycle": True,
            "back_edges": list(cycle_tracker.get("back_edges", [])),
            "iteration_count": iteration,
            "max_iterations": max_iterations,
            "stop_reason": "max_iterations_exceeded",
        }
        state["cycle_iterations"] = _serialize_cycle_records(cycle_tracker, final_stop_reason="max_iterations_exceeded")
        raise ValueError(
            f"Cycle execution exceeded loopLimit ({max_iterations}) for condition '{source_node}'. Add an exit branch or raise loopLimit."
        )

    _advance_condition_loop_iterations(cycle_tracker, next_iteration_edge_ids)
    next_iteration = iteration + 1
    cycle_tracker["current_iteration"] = next_iteration
    _ensure_cycle_iteration_record(cycle_tracker, next_iteration, next_iteration_edge_ids)


def _serialize_cycle_records(
    cycle_tracker: dict[str, Any],
    *,
    final_stop_reason: str | None = None,
) -> list[dict[str, Any]]:
    records = [
        dict(cycle_tracker.get("records", {}).get(iteration) or {})
        for iteration in sorted(cycle_tracker.get("records", {}))
    ]
    records = [
        record
        for record in records
        if record.get("executed_node_ids") or record.get("incoming_edge_ids") or record.get("activated_edge_ids")
    ]
    if records and final_stop_reason:
        records[-1]["stop_reason"] = final_stop_reason
    for record in records:
        record.pop("_changed_state_keys", None)
    return records


def _resolve_final_cycle_stop_reason(cycle_tracker: dict[str, Any]) -> str:
    records = [
        dict(cycle_tracker.get("records", {}).get(iteration) or {})
        for iteration in sorted(cycle_tracker.get("records", {}))
    ]
    if not records:
        return "completed"
    last_record = records[-1]
    if last_record.get("stop_reason"):
        return str(last_record["stop_reason"])
    if (
        last_record.get("incoming_edge_ids")
        and not last_record.get("executed_node_ids")
        and not last_record.get("activated_edge_ids")
    ):
        return "empty_iteration"
    return "completed"


def _finalize_langgraph_cycle_summary(
    state: dict[str, Any],
    cycle_tracker: dict[str, Any],
    active_edge_ids: set[str],
) -> None:
    if not cycle_tracker.get("has_cycle"):
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
        return

    final_stop_reason = _resolve_final_cycle_stop_reason(cycle_tracker)
    cycle_iterations = _serialize_cycle_records(cycle_tracker, final_stop_reason=final_stop_reason)
    state["cycle_summary"] = {
        "has_cycle": True,
        "back_edges": list(cycle_tracker.get("back_edges", [])),
        "iteration_count": len(cycle_iterations),
        "max_iterations": int(cycle_tracker.get("max_iterations", 0) or 0),
        "stop_reason": final_stop_reason,
    }
    state["cycle_iterations"] = cycle_iterations

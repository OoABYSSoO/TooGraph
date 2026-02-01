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
    _resolve_cycle_max_iterations,
    _refresh_run_artifacts,
    _select_active_outgoing_edges,
    _build_execution_edges,
)
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle, utc_now_iso
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.storage.run_store import save_run


def _replace_reducer(_current: Any, update: Any) -> Any:
    return update


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
    state["started_at"] = utc_now_iso()
    state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    state["metadata"] = dict(graph.metadata)
    state["metadata"]["resolved_runtime_backend"] = "langgraph"
    _initialize_graph_state(graph, state)
    checkpoint_saver, runtime_config, checkpoint_lookup_config = _build_checkpoint_runtime(graph=graph, state=state)

    execution_edges = _build_execution_edges(graph)
    outgoing_edges_by_source: dict[str, list[Any]] = defaultdict(list)
    for edge in execution_edges:
        outgoing_edges_by_source[edge.source].append(edge)
    cycle_tracker = _build_langgraph_cycle_tracker(graph, execution_edges)
    selected_branches: dict[str, str] = {}
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

    workflow = StateGraph(_build_langgraph_state_schema(graph))
    for node_name, node in graph.nodes.items():
        workflow.add_node(
            node_name,
            _build_langgraph_node_callable(
                graph=graph,
                node_name=node_name,
                state=state,
                node_outputs=node_outputs,
                active_edge_ids=active_edge_ids,
                outgoing_edges=outgoing_edges_by_source.get(node_name, []),
                selected_branches=selected_branches,
                cycle_tracker=cycle_tracker,
                persist_progress=persist_progress,
                started_perf=started_perf,
                run_lock=run_lock,
                checkpoint_saver=checkpoint_saver,
                checkpoint_lookup_config=checkpoint_lookup_config,
            ),
        )

    for node_name in build_plan.requirements.entry_nodes:
        workflow.add_edge(START, node_name)
    for edge in graph.edges:
        workflow.add_edge(edge.source, edge.target)
    for conditional_edge in graph.conditional_edges:
        workflow.add_conditional_edges(
            conditional_edge.source,
            _build_langgraph_route_callable(
                source_node=conditional_edge.source,
                selected_branches=selected_branches,
                run_lock=run_lock,
            ),
            path_map=dict(conditional_edge.branches),
        )
    for node_name in build_plan.requirements.terminal_nodes:
        workflow.add_edge(node_name, END)

    interrupt_before, interrupt_after = _resolve_interrupt_configuration(graph)
    compiled = workflow.compile(
        checkpointer=checkpoint_saver,
        interrupt_before=interrupt_before,
        interrupt_after=interrupt_after,
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
        _finalize_langgraph_cycle_summary(state, cycle_tracker, active_edge_ids)
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
        save_run(state)
        return state
    except Exception as exc:  # pragma: no cover - defensive runtime path
        set_run_status(state, "failed")
        state.setdefault("errors", []).append(str(exc))
        _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
        _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)
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
    selected_branches: dict[str, str],
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
                if body.get("selected_branch"):
                    selected_branches[node_name] = str(body["selected_branch"])
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
    source_node: str,
    selected_branches: dict[str, str],
    run_lock: threading.Lock,
):
    def _route(_current_values: dict[str, Any]) -> str:
        with run_lock:
            selected_branch = str(selected_branches.pop(source_node, "") or "").strip()
            if not selected_branch:
                raise ValueError(f"Condition node '{source_node}' did not produce a selected branch.")
            return selected_branch

    return _route


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


def _resolve_interrupt_configuration(graph: NodeSystemGraphDocument) -> tuple[list[str] | None, list[str] | None]:
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
        normalized = [item for item in items if item]
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
        node_name = str(getattr(task, "name", "") or "").strip()
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
        pending_nodes = [str(item) for item in (getattr(snapshot, "next", ()) or ()) if str(item).strip()]

    return pending_nodes, pending_interrupts


def _apply_waiting_state(
    state: dict[str, Any],
    snapshot: Any,
    *,
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
        node_status_map[node_name] = "paused"
    metadata = state.setdefault("metadata", {})
    metadata["pending_interrupt_nodes"] = pending_nodes
    metadata["pending_interrupts"] = pending_interrupts
    metadata["resolved_runtime_backend"] = "langgraph"
    _sync_checkpoint_metadata(state, checkpoint_saver, checkpoint_lookup_config)
    _refresh_run_artifacts(state, node_outputs, active_edge_ids, started_perf=started_perf)


def _clear_pending_interrupt_metadata(state: dict[str, Any]) -> None:
    metadata = state.setdefault("metadata", {})
    metadata.pop("pending_interrupt_nodes", None)
    metadata.pop("pending_interrupts", None)


def _build_langgraph_cycle_tracker(
    graph: NodeSystemGraphDocument,
    execution_edges: list[Any],
) -> dict[str, Any]:
    has_cycle, back_edges = CycleDetector(execution_edges).detect()
    back_edge_ids = {edge.id for edge in back_edges}
    tracker = {
        "has_cycle": has_cycle,
        "back_edges": [f"{edge.source}→{edge.target}" for edge in back_edges],
        "back_edge_ids": back_edge_ids,
        "max_iterations": _resolve_cycle_max_iterations(graph.metadata) if has_cycle else 0,
        "current_iteration": 1,
        "records": {},
    }
    if has_cycle:
        _ensure_cycle_iteration_record(tracker, 1, [])
    return tracker


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
        }
        return records[iteration]

    if incoming_edge_ids:
        records[iteration]["incoming_edge_ids"] = sorted(
            set(records[iteration].get("incoming_edge_ids", [])) | set(incoming_edge_ids)
        )
    return records[iteration]


def _record_cycle_activity(
    *,
    state: dict[str, Any],
    cycle_tracker: dict[str, Any],
    iteration: int,
    node_name: str,
    selected_edge_ids: set[str],
) -> None:
    if not cycle_tracker.get("has_cycle"):
        return

    record = _ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    record["executed_node_ids"] = [*record.get("executed_node_ids", []), node_name]
    record["activated_edge_ids"] = sorted(set(record.get("activated_edge_ids", [])) | set(selected_edge_ids))

    back_edge_ids = set(cycle_tracker.get("back_edge_ids", set()))
    next_iteration_edge_ids = sorted(edge_id for edge_id in selected_edge_ids if edge_id in back_edge_ids)
    if not next_iteration_edge_ids:
        return

    record["next_iteration_edge_ids"] = sorted(
        set(record.get("next_iteration_edge_ids", [])) | set(next_iteration_edge_ids)
    )
    next_iteration = iteration + 1
    max_iterations = int(cycle_tracker.get("max_iterations", 0) or 0)
    if max_iterations and next_iteration > max_iterations:
        record["stop_reason"] = "max_iterations_exceeded"
        state["cycle_summary"] = {
            "has_cycle": True,
            "back_edges": list(cycle_tracker.get("back_edges", [])),
            "iteration_count": max_iterations,
            "max_iterations": max_iterations,
            "stop_reason": "max_iterations_exceeded",
        }
        state["cycle_iterations"] = _serialize_cycle_records(cycle_tracker, final_stop_reason="max_iterations_exceeded")
        raise ValueError(
            f"Cycle execution exceeded max iterations ({max_iterations}). Add an exit branch or raise cycle_max_iterations."
        )

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
    return records


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

    cycle_iterations = _serialize_cycle_records(cycle_tracker, final_stop_reason="completed")
    state["cycle_summary"] = {
        "has_cycle": True,
        "back_edges": list(cycle_tracker.get("back_edges", [])),
        "iteration_count": len(cycle_iterations),
        "max_iterations": int(cycle_tracker.get("max_iterations", 0) or 0),
        "stop_reason": "completed",
    }
    state["cycle_iterations"] = cycle_iterations

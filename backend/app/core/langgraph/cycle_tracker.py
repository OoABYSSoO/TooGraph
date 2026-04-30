from __future__ import annotations

from typing import Any, Callable

from app.core.runtime.execution_graph import CycleDetector
from app.core.schemas.node_system import NodeSystemGraphDocument


def build_langgraph_cycle_tracker(
    graph: NodeSystemGraphDocument,
    execution_edges: list[Any],
    *,
    cycle_detector_factory: Callable[..., Any] = CycleDetector,
) -> dict[str, Any]:
    has_cycle, back_edges = cycle_detector_factory(execution_edges).detect()
    back_edge_ids = {edge.id for edge in back_edges}
    back_edges_by_id = {edge.id: edge for edge in back_edges}
    loop_limits_by_source = collect_condition_loop_limits(graph, back_edges)
    tracker = {
        "has_cycle": has_cycle,
        "back_edges": [f"{edge.source}→{edge.target}" for edge in back_edges],
        "back_edge_ids": back_edge_ids,
        "back_edges_by_id": back_edges_by_id,
        "loop_limits_by_source": loop_limits_by_source,
        "loop_iterations_by_source": {},
        "max_iterations": resolve_cycle_summary_max_iterations(loop_limits_by_source) if has_cycle else 0,
        "current_iteration": 1,
        "records": {},
    }
    if has_cycle:
        ensure_cycle_iteration_record(tracker, 1, [])
    return tracker


def collect_condition_loop_limits(
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


def resolve_cycle_summary_max_iterations(loop_limits_by_source: dict[str, int]) -> int:
    if not loop_limits_by_source:
        return -1
    finite_limits = [limit for limit in loop_limits_by_source.values() if limit >= 1]
    if not finite_limits:
        return -1
    return min(finite_limits)


def check_condition_loop_limit(
    cycle_tracker: dict[str, Any],
    next_iteration_edge_ids: list[str],
) -> tuple[int, str] | None:
    return peek_condition_loop_limit_violation(cycle_tracker, next_iteration_edge_ids)


def peek_condition_loop_limit_violation(
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


def advance_condition_loop_iterations(
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


def current_cycle_iteration(cycle_tracker: dict[str, Any]) -> int:
    if not cycle_tracker.get("has_cycle"):
        return 1
    iteration = int(cycle_tracker.get("current_iteration", 1) or 1)
    ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    return iteration


def ensure_cycle_iteration_record(
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


def mark_cycle_iteration_stop_reason(
    cycle_tracker: dict[str, Any],
    iteration: int,
    stop_reason: str,
) -> None:
    record = ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    record["stop_reason"] = stop_reason


def record_cycle_activity(
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

    record = ensure_cycle_iteration_record(cycle_tracker, iteration, [])
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

    _advance_cycle_from_selected_edges(state=state, cycle_tracker=cycle_tracker, iteration=iteration, record=record, selected_edge_ids=selected_edge_ids)


def record_cycle_route_activity(
    *,
    state: dict[str, Any],
    cycle_tracker: dict[str, Any],
    iteration: int,
    selected_edge_ids: set[str],
) -> None:
    if not cycle_tracker.get("has_cycle"):
        return

    record = ensure_cycle_iteration_record(cycle_tracker, iteration, [])
    record["activated_edge_ids"] = sorted(set(record.get("activated_edge_ids", [])) | set(selected_edge_ids))
    _advance_cycle_from_selected_edges(state=state, cycle_tracker=cycle_tracker, iteration=iteration, record=record, selected_edge_ids=selected_edge_ids)


def _advance_cycle_from_selected_edges(
    *,
    state: dict[str, Any],
    cycle_tracker: dict[str, Any],
    iteration: int,
    record: dict[str, Any],
    selected_edge_ids: set[str],
) -> None:
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
        state["cycle_iterations"] = serialize_cycle_records(cycle_tracker, final_stop_reason="no_state_change")
        raise RuntimeError(
            f"Cycle execution made no state progress in iteration {iteration}. Add an exit branch or update a state value inside the loop."
        )

    loop_limit_violation = peek_condition_loop_limit_violation(cycle_tracker, next_iteration_edge_ids)
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
        state["cycle_iterations"] = serialize_cycle_records(cycle_tracker, final_stop_reason="max_iterations_exceeded")
        raise ValueError(
            f"Cycle execution exceeded loopLimit ({max_iterations}) for condition '{source_node}'. Add an exit branch or raise loopLimit."
        )

    advance_condition_loop_iterations(cycle_tracker, next_iteration_edge_ids)
    next_iteration = iteration + 1
    cycle_tracker["current_iteration"] = next_iteration
    ensure_cycle_iteration_record(cycle_tracker, next_iteration, next_iteration_edge_ids)


def serialize_cycle_records(
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


def resolve_final_cycle_stop_reason(cycle_tracker: dict[str, Any]) -> str:
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


def finalize_langgraph_cycle_summary(
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

    final_stop_reason = resolve_final_cycle_stop_reason(cycle_tracker)
    cycle_iterations = serialize_cycle_records(cycle_tracker, final_stop_reason=final_stop_reason)
    state["cycle_summary"] = {
        "has_cycle": True,
        "back_edges": list(cycle_tracker.get("back_edges", [])),
        "iteration_count": len(cycle_iterations),
        "max_iterations": int(cycle_tracker.get("max_iterations", 0) or 0),
        "stop_reason": final_stop_reason,
    }
    state["cycle_iterations"] = cycle_iterations

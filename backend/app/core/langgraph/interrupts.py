from __future__ import annotations

from typing import Any, Callable

from app.core.langgraph.checkpoint_runtime import sync_checkpoint_metadata
from app.core.runtime.output_boundaries import collect_output_boundaries
from app.core.runtime.run_artifacts import append_run_snapshot, refresh_run_artifacts
from app.core.runtime.state import set_run_status
from app.core.schemas.node_system import NodeSystemGraphDocument

AFTER_BREAKPOINT_NODE_PREFIX = "__graphite_after_breakpoint__"


def after_breakpoint_node_name(node_name: str) -> str:
    return f"{AFTER_BREAKPOINT_NODE_PREFIX}{node_name}"


def source_node_from_after_breakpoint(node_name: str) -> str:
    if node_name.startswith(AFTER_BREAKPOINT_NODE_PREFIX):
        return node_name.removeprefix(AFTER_BREAKPOINT_NODE_PREFIX)
    return node_name


def resolve_interrupt_configuration(
    graph: NodeSystemGraphDocument,
    *,
    allowed_nodes: set[str] | None = None,
) -> list[str] | None:
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

    interrupt_after = _normalize(metadata.get("interrupt_after"))
    return interrupt_after


def is_waiting_for_human(snapshot: Any) -> bool:
    if snapshot is None:
        return False
    if getattr(snapshot, "next", ()):
        return True
    return snapshot_has_interrupt_payload(snapshot)


def snapshot_has_interrupt_payload(snapshot: Any) -> bool:
    for task in getattr(snapshot, "tasks", ()) or ():
        if getattr(task, "interrupts", ()):
            return True
    return False


def serialize_pending_interrupts(snapshot: Any) -> tuple[list[str], list[dict[str, Any]]]:
    pending_nodes: list[str] = []
    pending_interrupts: list[dict[str, Any]] = []

    for task in getattr(snapshot, "tasks", ()) or ():
        node_name = source_node_from_after_breakpoint(str(getattr(task, "name", "") or "").strip())
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
            source_node_from_after_breakpoint(str(item).strip())
            for item in (getattr(snapshot, "next", ()) or ())
            if str(item).strip()
        ]

    return pending_nodes, pending_interrupts


def apply_waiting_state(
    state: dict[str, Any],
    snapshot: Any,
    *,
    graph: NodeSystemGraphDocument,
    checkpoint_saver: Any,
    checkpoint_lookup_config: dict[str, Any],
    started_perf: float,
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    set_run_status_func: Callable[..., None] = set_run_status,
    collect_output_boundaries_func: Callable[..., Any] = collect_output_boundaries,
    sync_checkpoint_metadata_func: Callable[..., None] = sync_checkpoint_metadata,
    refresh_run_artifacts_func: Callable[..., None] = refresh_run_artifacts,
    append_run_snapshot_func: Callable[..., None] = append_run_snapshot,
) -> None:
    state["state_values"] = dict(getattr(snapshot, "values", {}) or {})
    pending_nodes, pending_interrupts = serialize_pending_interrupts(snapshot)
    pause_reason = "interrupt" if pending_interrupts else "breakpoint"
    set_run_status_func(state, "awaiting_human", pause_reason=pause_reason)
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
        collect_output_boundaries_func(graph, state, active_edge_ids)
    sync_checkpoint_metadata_func(state, checkpoint_saver, checkpoint_lookup_config)
    refresh_run_artifacts_func(state, node_outputs, active_edge_ids, started_perf=started_perf)
    append_run_snapshot_func(
        state,
        snapshot_id=next_run_snapshot_id(state, "pause"),
        kind="pause",
        label=f"Paused at {state.get('current_node_id') or 'unknown'}",
    )


def clear_pending_interrupt_metadata(state: dict[str, Any]) -> None:
    metadata = state.setdefault("metadata", {})
    metadata.pop("pending_interrupt_nodes", None)
    metadata.pop("pending_interrupts", None)


def next_run_snapshot_id(state: dict[str, Any], kind: str) -> str:
    existing = [item for item in state.get("run_snapshots", []) if item.get("kind") == kind]
    return f"{kind}_{len(existing) + 1}"

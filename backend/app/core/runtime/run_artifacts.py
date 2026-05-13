from __future__ import annotations

import copy
import time
from typing import Any

from app.core.runtime.state import utc_now_iso


def refresh_run_artifacts(
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
    state_stream_events = list(state.get("state_stream_events", []))
    activity_events = list(state.get("activity_events", []))
    state_last_writers = dict(state.get("state_last_writers", {}))
    state["artifacts"] = {
        "skill_outputs": state.get("skill_outputs", []),
        "activity_events": activity_events,
        "capability_outputs": state.get("capability_outputs", []),
        "output_previews": state.get("output_previews", []),
        "saved_outputs": saved_outputs,
        "exported_outputs": exported_outputs,
        "node_outputs": node_outputs,
        "active_edge_ids": sorted(active_edge_ids),
        "state_events": state_events,
        "state_stream_events": state_stream_events,
        "state_values": state_values,
        "streaming_outputs": dict(state.get("streaming_outputs", {})),
        "cycle_iterations": list(state.get("cycle_iterations", [])),
        "cycle_summary": dict(state.get("cycle_summary", {})),
    }
    state["state_snapshot"] = {
        "values": state_values,
        "last_writers": state_last_writers,
    }


def append_run_snapshot(
    state: dict[str, Any],
    *,
    snapshot_id: str,
    kind: str,
    label: str,
) -> None:
    snapshots = state.setdefault("run_snapshots", [])
    snapshots.append(
        {
            "snapshot_id": snapshot_id,
            "kind": kind,
            "label": label,
            "created_at": utc_now_iso(),
            "status": state.get("status", ""),
            "current_node_id": state.get("current_node_id"),
            "checkpoint_metadata": copy.deepcopy(state.get("checkpoint_metadata", {})),
            "state_snapshot": copy.deepcopy(state.get("state_snapshot", {})),
            "graph_snapshot": copy.deepcopy(state.get("graph_snapshot", {})),
            "artifacts": copy.deepcopy(state.get("artifacts", {})),
            "node_status_map": copy.deepcopy(state.get("node_status_map", {})),
            "subgraph_status_map": copy.deepcopy(state.get("subgraph_status_map", {})),
            "output_previews": copy.deepcopy(state.get("output_previews", [])),
            "final_result": str(state.get("final_result", "") or ""),
        }
    )

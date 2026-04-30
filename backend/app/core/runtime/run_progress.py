from __future__ import annotations

from typing import Any, Callable

from app.core.runtime.run_artifacts import refresh_run_artifacts
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import touch_run_lifecycle
from app.core.storage.run_store import save_run


def persist_run_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
    refresh_run_artifacts_func: Callable[..., None] = refresh_run_artifacts,
    touch_run_lifecycle_func: Callable[[dict[str, Any]], None] = touch_run_lifecycle,
    save_run_func: Callable[[dict[str, Any]], None] = save_run,
    publish_run_event_func: Callable[..., None] = publish_run_event,
) -> None:
    refresh_run_artifacts_func(state, node_outputs, active_edge_ids, started_perf=started_perf)
    touch_run_lifecycle_func(state)
    save_run_func(state)
    publish_run_event_func(
        str(state.get("run_id") or ""),
        "run.updated",
        {
            "status": state.get("status"),
            "current_node_id": state.get("current_node_id"),
            "duration_ms": state.get("duration_ms"),
            "updated_at": state.get("lifecycle", {}).get("updated_at") if isinstance(state.get("lifecycle"), dict) else None,
        },
    )

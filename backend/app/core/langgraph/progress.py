from __future__ import annotations

from typing import Any, Callable

from app.core.langgraph.checkpoints import JsonCheckpointSaver
from app.core.langgraph.checkpoint_runtime import sync_checkpoint_metadata
from app.core.runtime.node_system_executor import _persist_run_progress


def persist_langgraph_progress(
    state: dict[str, Any],
    node_outputs: dict[str, dict[str, Any]],
    active_edge_ids: set[str],
    *,
    started_perf: float,
    checkpoint_saver: JsonCheckpointSaver,
    checkpoint_lookup_config: dict[str, Any],
    sync_checkpoint_metadata_func: Callable[..., None] = sync_checkpoint_metadata,
    persist_run_progress_func: Callable[..., None] = _persist_run_progress,
) -> None:
    sync_checkpoint_metadata_func(state, checkpoint_saver, checkpoint_lookup_config)
    persist_run_progress_func(state, node_outputs, active_edge_ids, started_perf=started_perf)

from __future__ import annotations

from typing import Any, Callable

from app.core.langgraph.checkpoints import JsonCheckpointSaver


def build_checkpoint_runtime(
    *,
    state: dict[str, Any],
    graph: Any | None = None,
    checkpoint_saver_factory: Callable[[], Any] = JsonCheckpointSaver,
) -> tuple[Any, dict[str, Any], dict[str, Any]]:
    _ = graph
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

    checkpoint_saver = checkpoint_saver_factory()
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


def sync_checkpoint_metadata(
    state: dict[str, Any],
    checkpoint_saver: Any,
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

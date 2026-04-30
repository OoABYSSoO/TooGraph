from __future__ import annotations

import copy
from typing import Any

from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import utc_now_iso


def build_agent_stream_delta_callback(
    *,
    state: dict[str, Any],
    node_name: str,
    output_keys: list[str],
):
    run_id = str(state.get("run_id") or "").strip()
    if not run_id:
        return None

    text_parts: list[str] = []
    chunk_count = 0

    def _on_delta(delta: str) -> None:
        nonlocal chunk_count
        chunk_text = str(delta or "")
        if not chunk_text:
            return
        chunk_count += 1
        text_parts.append(chunk_text)
        full_text = "".join(text_parts)
        stream_record = {
            "node_id": node_name,
            "output_keys": list(output_keys),
            "text": full_text,
            "chunk_count": chunk_count,
            "completed": False,
            "updated_at": utc_now_iso(),
        }
        state.setdefault("streaming_outputs", {})[node_name] = stream_record
        publish_run_event(
            run_id,
            "node.output.delta",
            {
                **stream_record,
                "delta": chunk_text,
                "chunk_index": chunk_count,
            },
        )

    return _on_delta


def finalize_agent_stream_delta(
    *,
    state: dict[str, Any],
    node_name: str,
    output_values: dict[str, Any],
) -> None:
    stream_record = state.setdefault("streaming_outputs", {}).get(node_name)
    if not isinstance(stream_record, dict):
        return
    stream_record["completed"] = True
    stream_record["updated_at"] = utc_now_iso()
    stream_record["output_values"] = copy.deepcopy(output_values)
    publish_run_event(
        str(state.get("run_id") or ""),
        "node.output.completed",
        {
            **stream_record,
            "output_values": copy.deepcopy(output_values),
        },
    )

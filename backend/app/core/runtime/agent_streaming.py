from __future__ import annotations

import copy
from typing import Any

from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import utc_now_iso
from app.core.runtime.streaming_json_state_router import route_streaming_json_state_text


def build_agent_stream_delta_callback(
    *,
    state: dict[str, Any],
    node_name: str,
    output_keys: list[str],
    stream_state_keys: list[str] | None = None,
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
        updated_at = utc_now_iso()
        existing_record = state.setdefault("streaming_outputs", {}).get(node_name)
        completed_state_keys = set(
            existing_record.get("completed_state_keys", [])
            if isinstance(existing_record, dict) and isinstance(existing_record.get("completed_state_keys"), list)
            else []
        )
        stream_record = {
            "node_id": node_name,
            "output_keys": list(output_keys),
            "stream_state_keys": list(stream_state_keys or output_keys),
            "text": full_text,
            "chunk_count": chunk_count,
            "completed": False,
            "completed_state_keys": sorted(completed_state_keys),
            "updated_at": updated_at,
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
        _record_completed_stream_state_events(
            state=state,
            run_id=run_id,
            node_name=node_name,
            text=full_text,
            output_keys=list(output_keys),
            stream_state_keys=list(stream_state_keys or output_keys),
            completed_state_keys=completed_state_keys,
            chunk_count=chunk_count,
            created_at=updated_at,
        )
        stream_record["completed_state_keys"] = sorted(completed_state_keys)

    return _on_delta


def finalize_agent_stream_delta(
    *,
    state: dict[str, Any],
    node_name: str,
    output_values: dict[str, Any],
    reasoning: str | None = None,
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
    reasoning_text = str(reasoning or "").strip()
    if reasoning_text:
        publish_run_event(
            str(state.get("run_id") or ""),
            "node.reasoning.completed",
            {
                "node_id": node_name,
                "reasoning": reasoning_text,
                "updated_at": utc_now_iso(),
            },
        )


def _record_completed_stream_state_events(
    *,
    state: dict[str, Any],
    run_id: str,
    node_name: str,
    text: str,
    output_keys: list[str],
    stream_state_keys: list[str],
    completed_state_keys: set[str],
    chunk_count: int,
    created_at: str,
) -> None:
    target_state_keys = [key for key in (stream_state_keys or output_keys) if key]
    if not target_state_keys:
        return
    routed = route_streaming_json_state_text(text, target_state_keys)
    state_stream_events = state.setdefault("state_stream_events", [])
    for state_key, route in routed.items():
        if not route.get("completed") or state_key in completed_state_keys:
            continue
        event = {
            "node_id": node_name,
            "state_key": state_key,
            "status": "completed",
            "source": "node.output.delta",
            "chunk_count": chunk_count,
            "sequence": _next_state_stream_event_sequence(state_stream_events),
            "created_at": created_at,
        }
        state_stream_events.append(event)
        completed_state_keys.add(state_key)
        publish_run_event(run_id, "state.stream.completed", event)


def _next_state_stream_event_sequence(events: list[dict[str, Any]]) -> int:
    max_sequence = 0
    for event in events:
        try:
            max_sequence = max(max_sequence, int(event.get("sequence", 0)))
        except (TypeError, ValueError):
            continue
    return max_sequence + 1

from __future__ import annotations

from typing import Any, Callable

from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import utc_now_iso


def record_activity_event(
    state: dict[str, Any],
    *,
    kind: str,
    summary: str,
    node_id: str | None = None,
    status: str | None = None,
    duration_ms: int | None = None,
    detail: dict[str, Any] | None = None,
    error: str | None = None,
    publish_run_event_func: Callable[[str | None, str, dict[str, Any] | None], None] | None = None,
) -> dict[str, Any]:
    root_state = _root_run_state(state)
    events = root_state.setdefault("activity_events", [])
    if not isinstance(events, list):
        events = []
        root_state["activity_events"] = events

    context = _subgraph_context(state)
    event: dict[str, Any] = {
        "sequence": _next_activity_event_sequence(events),
        "kind": _compact_text(kind),
        "summary": _compact_text(summary),
        "created_at": utc_now_iso(),
    }
    normalized_node_id = _compact_text(node_id)
    if normalized_node_id:
        event["node_id"] = normalized_node_id
    if context:
        event["subgraph_node_id"] = context["node_id"]
        event["subgraph_path"] = context["path"]
    normalized_status = _compact_text(status)
    if normalized_status:
        event["status"] = normalized_status
    if duration_ms is not None:
        event["duration_ms"] = max(int(duration_ms), 0)
    normalized_detail = dict(detail or {})
    if normalized_detail:
        event["detail"] = normalized_detail
    normalized_error = _compact_text(error)
    if normalized_error:
        event["error"] = normalized_error

    events.append(event)
    publisher = publish_run_event_func or publish_run_event
    publisher(_compact_text(root_state.get("run_id") or state.get("run_id")) or None, "activity.event", event)
    return event


def record_skill_activity_events(
    state: dict[str, Any],
    *,
    node_id: str,
    skill_key: str,
    binding_source: str,
    raw_events: Any,
    publish_run_event_func: Callable[[str | None, str, dict[str, Any] | None], None] | None = None,
) -> list[dict[str, Any]]:
    if not isinstance(raw_events, list):
        return []

    recorded: list[dict[str, Any]] = []
    for raw_event in raw_events:
        if not isinstance(raw_event, dict):
            continue
        kind = _compact_text(raw_event.get("kind"))
        summary = _compact_text(raw_event.get("summary"))
        if not kind or not summary:
            continue
        detail = raw_event.get("detail") if isinstance(raw_event.get("detail"), dict) else {}
        event = record_activity_event(
            state,
            kind=kind,
            summary=summary,
            node_id=_compact_text(raw_event.get("node_id")) or node_id,
            status=_compact_text(raw_event.get("status")) or None,
            duration_ms=_optional_int(raw_event.get("duration_ms")),
            detail={
                "skill_key": skill_key,
                "binding_source": binding_source,
                **detail,
            },
            error=_compact_text(raw_event.get("error")) or None,
            publish_run_event_func=publish_run_event_func,
        )
        recorded.append(event)
    return recorded


def _root_run_state(state: dict[str, Any]) -> dict[str, Any]:
    root = state
    seen: set[int] = set()
    while isinstance(root.get("_parent_run_state"), dict):
        next_state = root["_parent_run_state"]
        next_id = id(next_state)
        if next_id in seen:
            break
        seen.add(next_id)
        root = next_state
    return root


def _subgraph_context(state: dict[str, Any]) -> dict[str, Any] | None:
    context = state.get("_subgraph_context")
    if not isinstance(context, dict):
        return None
    node_id = _compact_text(context.get("node_id"))
    path = context.get("path")
    if not node_id or not isinstance(path, list):
        return None
    return {
        "node_id": node_id,
        "path": [_compact_text(item) for item in path if _compact_text(item)],
    }


def _next_activity_event_sequence(events: list[dict[str, Any]]) -> int:
    max_sequence = 0
    for event in events:
        try:
            max_sequence = max(max_sequence, int(event.get("sequence") or 0))
        except (AttributeError, TypeError, ValueError):
            continue
    return max_sequence + 1


def _compact_text(value: Any) -> str:
    return str(value or "").strip()


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

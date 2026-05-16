from __future__ import annotations

import hashlib
import json
from typing import Any, Callable

from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import utc_now_iso

AUTO_RESUME_AFTER_UI_OPERATION = "auto_resume_after_ui_operation"
PAGE_OPERATION_RESUME_STATE_KEYS = ["page_operation_context", "page_context", "operation_result"]


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
    record_activity_event_func: Callable[..., dict[str, Any]] = record_activity_event,
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
        detail = {
            "skill_key": skill_key,
            "binding_source": binding_source,
            **detail,
        }
        detail = _enrich_virtual_ui_operation_detail(
            state,
            kind=kind,
            status=_compact_text(raw_event.get("status")),
            node_id=node_id,
            detail=detail,
        )
        event = record_activity_event_func(
            state,
            kind=kind,
            summary=summary,
            node_id=_compact_text(raw_event.get("node_id")) or node_id,
            status=_compact_text(raw_event.get("status")) or None,
            duration_ms=_optional_int(raw_event.get("duration_ms")),
            detail=detail,
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


def _enrich_virtual_ui_operation_detail(
    state: dict[str, Any],
    *,
    kind: str,
    status: str,
    node_id: str,
    detail: dict[str, Any],
) -> dict[str, Any]:
    if kind != "virtual_ui_operation" or status == "failed":
        return detail

    enriched = dict(detail)
    operation_request = enriched.get("operation_request")
    operation_request_record = dict(operation_request) if isinstance(operation_request, dict) else {}
    operation_request_id = _compact_text(
        enriched.get("operation_request_id")
        or enriched.get("operationRequestId")
        or operation_request_record.get("operation_request_id")
        or operation_request_record.get("operationRequestId")
    )
    if not operation_request_id:
        operation_request_id = _stable_virtual_operation_request_id(state, node_id=node_id, detail=enriched)

    enriched["operation_request_id"] = operation_request_id
    if operation_request_record:
        operation_request_record["operation_request_id"] = operation_request_id
        enriched["operation_request"] = operation_request_record
    enriched["expected_continuation"] = _normalize_expected_continuation(
        enriched.get("expected_continuation") or enriched.get("expectedContinuation"),
        operation_request_id=operation_request_id,
    )

    root_state = _root_run_state(state)
    run_id = _compact_text(root_state.get("run_id") or state.get("run_id"))
    if run_id:
        enriched["run_id"] = run_id
    normalized_node_id = _compact_text(node_id)
    if normalized_node_id:
        enriched["node_id"] = normalized_node_id
    context = _subgraph_context(state)
    if context:
        enriched["subgraph_node_id"] = context["node_id"]
        enriched["subgraph_path"] = context["path"]
    _store_pending_page_operation_continuation(state, enriched)
    return enriched


def _normalize_expected_continuation(value: Any, *, operation_request_id: str) -> dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    resume_state_keys = _list_text(source.get("resume_state_keys") or source.get("resumeStateKeys"))
    if not resume_state_keys:
        resume_state_keys = list(PAGE_OPERATION_RESUME_STATE_KEYS)
    for required_key in PAGE_OPERATION_RESUME_STATE_KEYS:
        if required_key not in resume_state_keys:
            resume_state_keys.append(required_key)
    return {
        "mode": AUTO_RESUME_AFTER_UI_OPERATION,
        "operation_request_id": operation_request_id,
        "resume_state_keys": resume_state_keys,
    }


def _stable_virtual_operation_request_id(state: dict[str, Any], *, node_id: str, detail: dict[str, Any]) -> str:
    root_state = _root_run_state(state)
    payload = {
        "run_id": _compact_text(root_state.get("run_id") or state.get("run_id")),
        "node_id": _compact_text(node_id),
        "operation_request": detail.get("operation_request"),
        "commands": detail.get("commands"),
        "operation": detail.get("operation"),
    }
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"vop_{digest[:16]}"


def _store_pending_page_operation_continuation(state: dict[str, Any], detail: dict[str, Any]) -> None:
    continuation = detail.get("expected_continuation")
    if not isinstance(continuation, dict):
        return
    operation_request_id = _compact_text(continuation.get("operation_request_id") or detail.get("operation_request_id"))
    if not operation_request_id:
        return
    pending: dict[str, Any] = {
        "mode": AUTO_RESUME_AFTER_UI_OPERATION,
        "operation_request_id": operation_request_id,
        "resume_state_keys": _list_text(continuation.get("resume_state_keys")) or list(PAGE_OPERATION_RESUME_STATE_KEYS),
    }
    for key in ("run_id", "node_id", "subgraph_node_id", "subgraph_path"):
        value = detail.get(key)
        if value:
            pending[key] = value
    state.setdefault("metadata", {})["pending_page_operation_continuation"] = pending


def _list_text(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_compact_text(item) for item in value if _compact_text(item)]


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

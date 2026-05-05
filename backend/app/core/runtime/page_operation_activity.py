from __future__ import annotations

import copy
from typing import Any, Callable

from app.core.runtime.activity_events import record_activity_event
from app.core.runtime.run_events import publish_run_event


def record_page_operation_resume_activity(
    resumed_run: dict[str, Any],
    previous_metadata: dict[str, Any],
    payload: dict[str, Any] | None,
    *,
    publish_run_event_func: Callable[[str | None, str, dict[str, Any] | None], None] | None = None,
) -> None:
    pending = find_pending_page_operation_continuation(previous_metadata)
    resume_payload = payload.get("resume") if isinstance(payload, dict) else None
    operation_result = resume_payload.get("operation_result") if isinstance(resume_payload, dict) else None
    if not isinstance(pending, dict) or not isinstance(operation_result, dict):
        return

    operation_request_id = str(operation_result.get("operation_request_id") or pending.get("operation_request_id") or "").strip()
    if not operation_request_id:
        return
    operation_report = resume_payload.get("operation_report") if isinstance(resume_payload, dict) else None
    if not isinstance(operation_report, dict):
        operation_report = operation_result.get("operation_report") if isinstance(operation_result.get("operation_report"), dict) else {}
    operation_report = dict(operation_report)
    if not operation_report:
        operation_report = _compact_page_operation_report(operation_result)

    status = _normalize_page_operation_status(operation_result.get("status"))
    operation = _infer_page_operation(operation_result, operation_report)
    failure_category = _resolve_page_operation_failure_category(operation_result, operation_report, status)
    detail: dict[str, Any] = {
        "operation_request_id": operation_request_id,
        "operation": operation,
        "operation_report": operation_report,
        "page_snapshots": {
            "before": _compact_page_operation_snapshot(operation_result.get("page_snapshot_before")),
            "after": _compact_page_operation_snapshot(operation_result.get("page_snapshot_after")),
        },
        "triggered_run": {
            "run_id": _compact_text(operation_report.get("triggered_run_id") or operation_result.get("triggered_run_id")),
            "graph_id": _compact_text(operation_report.get("triggered_graph_id") or operation_result.get("triggered_graph_id")),
            "initial_status": _compact_text(
                operation_report.get("triggered_run_initial_status") or operation_result.get("triggered_run_initial_status")
            ),
            "status": _compact_text(operation_report.get("triggered_run_status") or operation_result.get("triggered_run_status")),
            "result_summary": _compact_text(
                operation_report.get("triggered_run_result_summary") or operation_result.get("triggered_run_result_summary")
            ),
        },
    }
    if failure_category:
        detail["failure_category"] = failure_category
        operation_report.setdefault("failure_category", failure_category)

    event_state: dict[str, Any] = {
        "run_id": resumed_run.get("run_id"),
        "_parent_run_state": resumed_run,
    }
    subgraph_node_id = _compact_text(pending.get("subgraph_node_id"))
    subgraph_path = _list_text(pending.get("subgraph_path"))
    if subgraph_node_id:
        event_state["_subgraph_context"] = {"node_id": subgraph_node_id, "path": subgraph_path or [subgraph_node_id]}
    record_activity_event(
        event_state,
        kind="virtual_ui_operation",
        summary=_summarize_page_operation_completion(operation, operation_report, status),
        node_id=_compact_text(pending.get("node_id")) or None,
        status=status,
        detail=detail,
        error=_compact_text(operation_report.get("error") or operation_result.get("error")) or None,
        publish_run_event_func=publish_run_event_func or publish_run_event,
    )
    artifacts = resumed_run.setdefault("artifacts", {})
    if isinstance(artifacts, dict):
        artifacts["activity_events"] = list(resumed_run.get("activity_events", []))


def find_pending_page_operation_continuation(metadata: dict[str, Any]) -> dict[str, Any] | None:
    pending = metadata.get("pending_page_operation_continuation")
    if isinstance(pending, dict):
        return pending
    pending_subgraph = metadata.get("pending_subgraph_breakpoint")
    if not isinstance(pending_subgraph, dict):
        return None
    nested_metadata = pending_subgraph.get("metadata")
    if not isinstance(nested_metadata, dict):
        return None
    nested_pending = nested_metadata.get("pending_page_operation_continuation")
    return nested_pending if isinstance(nested_pending, dict) else None


def _compact_page_operation_report(operation_result: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "operation_request_id",
        "status",
        "target_id",
        "commands",
        "route_before",
        "route_after",
        "triggered_run_id",
        "triggered_graph_id",
        "triggered_run_initial_status",
        "triggered_run_status",
        "triggered_run_result_summary",
        "triggered_run_final_result",
        "input_text",
        "graph_edit_summary",
        "failure_category",
        "error",
    )
    return {key: copy.deepcopy(operation_result.get(key)) for key in keys if key in operation_result}


def _compact_page_operation_snapshot(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return {
        "snapshot_id": _compact_text(value.get("snapshotId") or value.get("snapshot_id")),
        "path": _compact_text(value.get("path")),
        "title": _compact_text(value.get("title")),
    }


def _infer_page_operation(operation_result: dict[str, Any], operation_report: dict[str, Any]) -> dict[str, Any]:
    commands = _list_text(operation_report.get("commands") or operation_result.get("commands"))
    command = commands[0] if commands else ""
    target_id = _compact_text(operation_report.get("target_id") or operation_result.get("target_id"))
    input_text = _compact_text(operation_report.get("input_text") or operation_result.get("input_text"))
    if command.startswith("run_template "):
        search_text = command.removeprefix("run_template ").strip()
        return {
            "kind": "run_template",
            "target_id": target_id,
            "search_text": search_text,
            "input_text": input_text,
        }
    if operation_report.get("graph_edit_summary") or operation_result.get("graph_edit_summary") or command.startswith("graph_edit "):
        graph_edit_summary = operation_report.get("graph_edit_summary") or operation_result.get("graph_edit_summary")
        return {
            "kind": "graph_edit",
            "target_id": target_id,
            "graph_edit_summary": copy.deepcopy(graph_edit_summary) if isinstance(graph_edit_summary, dict) else None,
        }
    action = command.split(maxsplit=1)[0].strip() if command else ""
    return {
        "kind": action or "unknown",
        "target_id": target_id,
    }


def _resolve_page_operation_failure_category(
    operation_result: dict[str, Any],
    operation_report: dict[str, Any],
    status: str,
) -> str:
    explicit = _compact_text(operation_report.get("failure_category") or operation_result.get("failure_category"))
    if explicit:
        return explicit
    if status == "succeeded":
        return ""
    if status == "interrupted":
        return "user_interrupted"
    triggered_status = _compact_text(operation_report.get("triggered_run_status") or operation_result.get("triggered_run_status"))
    if triggered_status == "failed":
        return "target_run_failed"
    if _compact_text(operation_report.get("error") or operation_result.get("error")):
        return "frontend_operation_failed"
    return "operation_failed"


def _summarize_page_operation_completion(operation: dict[str, Any], operation_report: dict[str, Any], status: str) -> str:
    operation_kind = _compact_text(operation.get("kind")) or "operation"
    request_id = _compact_text(operation_report.get("operation_request_id"))
    triggered_run_id = _compact_text(operation_report.get("triggered_run_id"))
    triggered_run_status = _compact_text(operation_report.get("triggered_run_status"))
    parts = [f"Virtual {operation_kind} {status}"]
    if triggered_run_id:
        parts.append(f"triggered run {triggered_run_id}{f' {triggered_run_status}' if triggered_run_status else ''}")
    if request_id:
        parts.append(f"request {request_id}")
    return ". ".join(parts) + "."


def _normalize_page_operation_status(value: Any) -> str:
    status = _compact_text(value)
    return status if status in {"succeeded", "failed", "interrupted"} else "succeeded"


def _list_text(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_compact_text(item) for item in value if _compact_text(item)]


def _compact_text(value: Any) -> str:
    return str(value or "").strip()

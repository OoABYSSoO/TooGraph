from __future__ import annotations

import copy
import logging
import re
import threading
from typing import Any
from uuid import uuid4

from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError

from app.core.compiler.validator import validate_graph
from app.core.langgraph import execute_node_system_graph_langgraph, get_langgraph_runtime_unsupported_reasons
from app.core.runtime.run_events import publish_run_event
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.runtime.state_io import input_state_keys
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.storage.run_store import save_run
from app.scheduler import message_outlet, store
from app.templates.loader import load_template_record


logger = logging.getLogger(__name__)

TEMPLATE_METADATA_KEYS = {
    "template_id",
    "label",
    "description",
    "default_graph_name",
    "source",
    "status",
    "capabilityDiscoverable",
    "hasBreakpointMetadata",
    "capabilityDiscoverableBlockedReason",
}

SCHEDULED_GRAPH_PERMISSION_POLICY = {
    "allowed_permission_tiers": ["none", "guarded", "external", "risky"],
    "approval_required_permission_tiers": ["risky"],
}


class _InlineBackgroundTasks:
    def __init__(self) -> None:
        self.tasks: list[tuple[Any, tuple[Any, ...], dict[str, Any]]] = []

    def add_task(self, func: Any, *args: Any, **kwargs: Any) -> None:
        self.tasks.append((func, args, kwargs))


class _DaemonBackgroundTasks:
    def add_task(self, func: Any, *args: Any, **kwargs: Any) -> None:
        thread = threading.Thread(target=func, args=args, kwargs=kwargs, daemon=True)
        thread.start()


def start_scheduled_graph_job_run(
    job_id: str,
    *,
    background_tasks: BackgroundTasks,
    trigger_reason: str = "manual",
    requested_by: str = "",
    event_name: str = "",
    event: dict[str, Any] | None = None,
) -> dict[str, Any]:
    job = store.load_scheduled_graph_job(job_id)
    if not job["enabled"]:
        raise ValueError(f"Scheduled graph job '{job_id}' is disabled.")
    job_run_id = f"schedrun_{uuid4().hex[:12]}"
    graph = build_scheduled_graph_document(
        job,
        job_run_id=job_run_id,
        trigger_reason=trigger_reason,
        requested_by=requested_by,
        event_name=event_name,
        event=event,
    )
    validation = validate_graph(graph)
    if not validation.valid:
        raise HTTPException(status_code=422, detail=validation.model_dump())
    unsupported_reasons = get_langgraph_runtime_unsupported_reasons(graph)
    if unsupported_reasons:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Scheduled graph job '{job['job_id']}' uses a graph that is not supported by the LangGraph runtime.",
                "reasons": unsupported_reasons,
            },
        )

    run_state = create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    run_state["template_id"] = job["template_id"]
    run_state["runtime_backend"] = "langgraph"
    run_state["metadata"] = {
        **dict(graph.metadata),
        "resolved_runtime_backend": "langgraph",
    }
    run_state["graph_snapshot"] = graph.model_dump(by_alias=True, mode="json")
    run_state["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    touch_run_lifecycle(run_state)
    save_run(run_state)
    job_run = store.record_scheduled_graph_job_run(
        job["job_id"],
        job_run_id=job_run_id,
        run_id=run_state["run_id"],
        trigger_reason=trigger_reason,
        status="running",
        started_at=str(run_state.get("started_at") or ""),
        metadata={
            "requested_by": requested_by,
            **({"scheduled_graph_event": _scheduled_event_metadata(event_name, event)} if event_name else {}),
        },
    )
    background_tasks.add_task(_run_scheduled_graph_worker, graph, run_state)
    return {
        "job": store.load_scheduled_graph_job(job["job_id"]),
        "job_run": job_run,
        "run_id": run_state["run_id"],
        "status": run_state["status"],
    }


def run_due_scheduled_graph_jobs(
    *,
    background_tasks: BackgroundTasks,
    now: str | None = None,
    limit: int = 25,
    requested_by: str = "scheduler",
) -> dict[str, Any]:
    jobs = store.list_due_scheduled_graph_jobs(now=now, limit=limit)
    started: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for job in jobs:
        try:
            started.append(
                start_scheduled_graph_job_run(
                    job["job_id"],
                    background_tasks=background_tasks,
                    trigger_reason=store.resolve_due_trigger_reason(job),
                    requested_by=requested_by,
                )
            )
        except Exception as exc:
            logger.exception("Failed to start scheduled graph job %s: %s", job.get("job_id"), exc)
            errors.append({"job_id": str(job.get("job_id") or ""), "message": str(exc)})
            store.record_scheduled_graph_job_run(
                str(job.get("job_id") or ""),
                trigger_reason=store.resolve_due_trigger_reason(job),
                status="failed",
                error=str(exc),
                now=now,
            )
    return {
        "started": started,
        "started_count": len(started),
        "skipped_count": len(errors),
        "errors": errors,
    }


def run_event_scheduled_graph_jobs(
    event_name: str,
    *,
    event: dict[str, Any] | None = None,
    background_tasks: BackgroundTasks,
    requested_by: str = "scheduler_event",
) -> dict[str, Any]:
    normalized_event_name = str(event_name or "").strip()
    if not normalized_event_name:
        return {"started": [], "started_count": 0, "skipped_count": 0, "errors": []}
    jobs = store.list_event_scheduled_graph_jobs(normalized_event_name)
    started: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for job in jobs:
        try:
            started.append(
                start_scheduled_graph_job_run(
                    job["job_id"],
                    background_tasks=background_tasks,
                    trigger_reason="event",
                    requested_by=requested_by,
                    event_name=normalized_event_name,
                    event=event,
                )
            )
        except Exception as exc:
            logger.exception("Failed to start event scheduled graph job %s: %s", job.get("job_id"), exc)
            errors.append({"job_id": str(job.get("job_id") or ""), "message": str(exc)})
            store.record_scheduled_graph_job_run(
                str(job.get("job_id") or ""),
                trigger_reason="event",
                status="failed",
                error=str(exc),
                metadata={
                    "requested_by": requested_by,
                    "scheduled_graph_event": _scheduled_event_metadata(normalized_event_name, event),
                },
            )
    return {
        "started": started,
        "started_count": len(started),
        "skipped_count": len(errors),
        "errors": errors,
    }


def run_event_scheduled_graph_jobs_inline(
    event_name: str,
    *,
    event: dict[str, Any] | None = None,
    requested_by: str = "scheduler_event",
) -> dict[str, Any]:
    background_tasks = _InlineBackgroundTasks()
    result = run_event_scheduled_graph_jobs(
        event_name,
        event=event,
        background_tasks=background_tasks,  # type: ignore[arg-type]
        requested_by=requested_by,
    )
    for func, args, kwargs in background_tasks.tasks:
        func(*args, **kwargs)
    return result


def build_scheduled_graph_document(
    job: dict[str, Any],
    *,
    job_run_id: str,
    trigger_reason: str,
    requested_by: str = "",
    event_name: str = "",
    event: dict[str, Any] | None = None,
) -> NodeSystemGraphDocument:
    try:
        template = load_template_record(job["template_id"])
    except KeyError as exc:
        raise ValueError(f"template_id '{job['template_id']}' does not exist.") from exc
    payload = {
        key: copy.deepcopy(value)
        for key, value in template.items()
        if key not in TEMPLATE_METADATA_KEYS
    }
    graph = NodeSystemGraphDocument.model_validate(
        {
            **payload,
            "graph_id": _scheduled_runtime_graph_id(job["template_id"], job["job_id"]),
            "name": f"{template.get('default_graph_name') or template.get('label') or job['template_id']} / {job['name']}",
        }
    )
    graph_data = graph.model_dump(by_alias=True, mode="json")
    state_schema = dict(graph_data.get("state_schema") or {})
    input_keys = input_state_keys(graph)
    applied_input_keys: list[str] = []
    input_bindings = _resolve_event_input_bindings(dict(job.get("input_bindings") or {}), event or {}) if event_name else dict(job.get("input_bindings") or {})
    for state_key, value in dict(job.get("input_bindings") or {}).items():
        value = input_bindings.get(state_key, value)
        if state_key not in input_keys or state_key not in state_schema:
            continue
        state_schema[state_key] = {
            **dict(state_schema[state_key]),
            "value": copy.deepcopy(value),
        }
        applied_input_keys.append(state_key)
    graph_data["state_schema"] = state_schema
    graph_data["metadata"] = {
        **_apply_scheduled_permission_metadata(dict(graph.metadata)),
        "scheduled_graph_job": {
            "job_id": job["job_id"],
            "job_run_id": job_run_id,
            "template_id": job["template_id"],
            "trigger_reason": trigger_reason,
            "requested_by": requested_by,
            "applied_input_keys": applied_input_keys,
        },
        "scheduled_graph_job_id": job["job_id"],
        "scheduled_graph_job_run_id": job_run_id,
        "scheduled_graph_trigger_reason": trigger_reason,
        **({"scheduled_graph_event": _scheduled_event_metadata(event_name, event)} if event_name else {}),
    }
    try:
        return NodeSystemGraphDocument.model_validate(graph_data)
    except ValidationError as exc:
        raise ValueError(f"Scheduled graph job '{job['job_id']}' produced an invalid graph snapshot.") from exc


def _run_scheduled_graph_worker(graph: NodeSystemGraphDocument, run_state: dict[str, Any]) -> None:
    job_run_id = str((run_state.get("metadata") or {}).get("scheduled_graph_job_run_id") or "")
    try:
        execute_node_system_graph_langgraph(graph, run_state, persist_progress=True)
        if job_run_id:
            store.update_scheduled_graph_job_run(job_run_id, status=str(run_state.get("status") or "completed"))
            message_outlet.deliver_scheduled_graph_job_outputs(job_run_id, run_state)
        _trigger_embedding_drain_followups(run_state)
        _finalize_scheduled_buddy_memory_review(run_state)
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Scheduled graph run %s failed: %s", run_state.get("run_id"), exc)
        set_run_status(run_state, "failed")
        run_state.setdefault("errors", []).append(str(exc))
        save_run(run_state)
        if job_run_id:
            store.update_scheduled_graph_job_run(job_run_id, status="failed", error=str(exc))
        _finalize_scheduled_buddy_memory_review(run_state, error=str(exc))
        publish_run_event(
            str(run_state.get("run_id") or ""),
            "run.failed",
            {"status": "failed", "error": str(exc)},
        )


def _scheduled_runtime_graph_id(template_id: str, job_id: str) -> str:
    return f"scheduled_{_safe_identifier(template_id)}_{_safe_identifier(job_id)}_{uuid4().hex[:8]}"


def _apply_scheduled_permission_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    next_metadata = dict(metadata)
    next_metadata["graph_permission_mode"] = "ask_first"
    next_metadata["capability_permission_policy"] = _merge_scheduled_permission_policy(
        next_metadata.get("capability_permission_policy")
    )
    next_metadata["scheduled_graph_permission_policy_source"] = "scheduler_default"
    return next_metadata


def _merge_scheduled_permission_policy(existing: Any) -> dict[str, Any]:
    policy = copy.deepcopy(existing) if isinstance(existing, dict) else {}
    if not isinstance(policy.get("allowed_permission_tiers"), list):
        policy["allowed_permission_tiers"] = list(SCHEDULED_GRAPH_PERMISSION_POLICY["allowed_permission_tiers"])
    policy["approval_required_permission_tiers"] = _merge_unique_strings(
        policy.get("approval_required_permission_tiers"),
        SCHEDULED_GRAPH_PERMISSION_POLICY["approval_required_permission_tiers"],
    )
    return policy


def _merge_unique_strings(first: Any, second: Any) -> list[str]:
    result: list[str] = []
    for source in (first, second):
        if not isinstance(source, list):
            continue
        for item in source:
            text = str(item or "").strip()
            if text and text not in result:
                result.append(text)
    return result


EVENT_PLACEHOLDER_RE = re.compile(r"\{\{\s*event\.([A-Za-z0-9_.-]+)\s*\}\}")


def _resolve_event_input_bindings(input_bindings: dict[str, Any], event: dict[str, Any]) -> dict[str, Any]:
    return {key: _resolve_event_input_value(value, event) for key, value in input_bindings.items()}


def _resolve_event_input_value(value: Any, event: dict[str, Any]) -> Any:
    if isinstance(value, str):
        exact_match = EVENT_PLACEHOLDER_RE.fullmatch(value.strip())
        if exact_match:
            return copy.deepcopy(_lookup_event_value(event, exact_match.group(1)))
        return EVENT_PLACEHOLDER_RE.sub(lambda match: str(_lookup_event_value(event, match.group(1)) or ""), value)
    if isinstance(value, list):
        return [_resolve_event_input_value(item, event) for item in value]
    if isinstance(value, dict):
        return {key: _resolve_event_input_value(item, event) for key, item in value.items()}
    return copy.deepcopy(value)


def _lookup_event_value(event: dict[str, Any], path: str) -> Any:
    current: Any = event
    for part in str(path or "").split("."):
        if not isinstance(current, dict) or part not in current:
            return ""
        current = current[part]
    return current


def _scheduled_event_metadata(event_name: str, event: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "name": str(event_name or "").strip(),
        "payload": copy.deepcopy(event if isinstance(event, dict) else {}),
    }


def _safe_identifier(value: str) -> str:
    normalized = str(value or "").strip().replace(" ", "_")
    normalized = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in normalized)
    return normalized[:48] or "target"


def _finalize_scheduled_buddy_memory_review(run_state: dict[str, Any], *, error: str = "") -> None:
    if str(run_state.get("template_id") or "") != "buddy_autonomous_review":
        return
    review_run_id = str(run_state.get("run_id") or "").strip()
    if not review_run_id:
        return
    try:
        from app.buddy import store as buddy_store

        record = buddy_store.get_background_review_run_by_review_run_id(review_run_id)
        run_status = str(run_state.get("status") or "").strip() or "completed"
        review_status = "completed" if run_status == "completed" else ("failed" if run_status == "failed" else run_status)
        if review_status not in buddy_store.BACKGROUND_REVIEW_STATUSES:
            review_status = "failed"
        buddy_store.mark_background_review_run_finished(
            record["review_id"],
            status=review_status,
            error=error,
        )
    except KeyError:
        return


def _trigger_embedding_drain_followups(run_state: dict[str, Any]) -> None:
    if str(run_state.get("status") or "") != "completed":
        return
    try:
        _trigger_knowledge_embedding_continuation_if_needed(run_state)
        _trigger_memory_embedding_after_memory_ingestion_if_needed(run_state)
        _trigger_ready_lanes_after_queue_maintenance_if_needed(run_state)
    except Exception as exc:  # pragma: no cover - defensive follow-up path
        logger.exception("Failed to trigger embedding drain follow-up for run %s: %s", run_state.get("run_id"), exc)


def _trigger_knowledge_embedding_continuation_if_needed(run_state: dict[str, Any]) -> None:
    if str(run_state.get("template_id") or "") != "knowledge_embedding_drain":
        return
    values = _run_state_values(run_state)
    if _text(values.get("processor_status")) != "succeeded":
        return
    remaining_count = _int(values.get("remaining_count"))
    processed_count = _int(values.get("processed_count"))
    completed_count = _int(values.get("completed_count"))
    if remaining_count <= 0 or max(processed_count, completed_count) <= 0:
        return
    collection_id = _text(values.get("collection_id"))
    operation_id = _text(values.get("operation_id"))
    event_payload = _scheduled_event_payload(run_state)
    collection_id = collection_id or _text(event_payload.get("collection_id"))
    operation_id = operation_id or _text(event_payload.get("operation_id"))
    if not collection_id or not operation_id:
        return
    run_event_scheduled_graph_jobs(
        "knowledge.ingestion.completed",
        event={
            "collection_id": collection_id,
            "operation_id": operation_id,
            "continuation_parent_run_id": _text(run_state.get("run_id")),
            "remaining_count": remaining_count,
        },
        background_tasks=_DaemonBackgroundTasks(),  # type: ignore[arg-type]
        requested_by="knowledge_embedding_continuation",
    )


def _trigger_memory_embedding_after_memory_ingestion_if_needed(run_state: dict[str, Any]) -> None:
    template_id = str(run_state.get("template_id") or "")
    if template_id not in {"buddy_message_retrieval_ingestion", "buddy_autonomous_review"}:
        return
    _trigger_memory_embedding_if_ready(
        requested_by=f"{template_id}_completed",
        event={
            "source_template_id": template_id,
            "source_run_id": _text(run_state.get("run_id")),
        },
    )


def _trigger_ready_lanes_after_queue_maintenance_if_needed(run_state: dict[str, Any]) -> None:
    metadata = run_state.get("metadata") if isinstance(run_state.get("metadata"), dict) else {}
    if str(run_state.get("template_id") or "") != "embedding_maintenance" and metadata.get("role") != "embedding_queue_maintenance":
        return
    from app.core.storage.embedding_store import list_ready_knowledge_embedding_operations

    for operation in list_ready_knowledge_embedding_operations():
        collection_id = _text(operation.get("collection_id"))
        operation_id = _text(operation.get("operation_id"))
        if not collection_id or not operation_id:
            continue
        run_event_scheduled_graph_jobs(
            "knowledge.ingestion.completed",
            event={
                "collection_id": collection_id,
                "operation_id": operation_id,
                "source": "embedding_queue_maintenance",
                "ready_count": int(operation.get("ready_count") or 0),
            },
            background_tasks=_DaemonBackgroundTasks(),  # type: ignore[arg-type]
            requested_by="embedding_queue_maintenance",
        )
    _trigger_memory_embedding_if_ready(
        requested_by="embedding_queue_maintenance",
        event={"source": "embedding_queue_maintenance"},
    )


def _trigger_memory_embedding_if_ready(*, requested_by: str, event: dict[str, Any]) -> None:
    from app.core.storage.embedding_store import has_running_memory_embedding_jobs, ready_memory_embedding_job_count

    ready_count = ready_memory_embedding_job_count()
    if ready_count <= 0 or has_running_memory_embedding_jobs():
        return
    run_event_scheduled_graph_jobs(
        "memory.embedding.queued",
        event={**event, "ready_count": ready_count},
        background_tasks=_DaemonBackgroundTasks(),  # type: ignore[arg-type]
        requested_by=requested_by,
    )


def _run_state_values(run_state: dict[str, Any]) -> dict[str, Any]:
    values = run_state.get("state_values")
    if isinstance(values, dict):
        return values
    snapshot = run_state.get("state_snapshot") if isinstance(run_state.get("state_snapshot"), dict) else {}
    snapshot_values = snapshot.get("values")
    return snapshot_values if isinstance(snapshot_values, dict) else {}


def _scheduled_event_payload(run_state: dict[str, Any]) -> dict[str, Any]:
    metadata = run_state.get("metadata") if isinstance(run_state.get("metadata"), dict) else {}
    event = metadata.get("scheduled_graph_event") if isinstance(metadata.get("scheduled_graph_event"), dict) else {}
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    return payload


def _text(value: Any) -> str:
    return str(value or "").strip()


def _int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0

from __future__ import annotations

import copy
import logging
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
from app.scheduler import store
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


def start_scheduled_graph_job_run(
    job_id: str,
    *,
    background_tasks: BackgroundTasks,
    trigger_reason: str = "manual",
    requested_by: str = "",
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
        metadata={"requested_by": requested_by},
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


def build_scheduled_graph_document(
    job: dict[str, Any],
    *,
    job_run_id: str,
    trigger_reason: str,
    requested_by: str = "",
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
    for state_key, value in dict(job.get("input_bindings") or {}).items():
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
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Scheduled graph run %s failed: %s", run_state.get("run_id"), exc)
        set_run_status(run_state, "failed")
        run_state.setdefault("errors", []).append(str(exc))
        save_run(run_state)
        if job_run_id:
            store.update_scheduled_graph_job_run(job_run_id, status="failed", error=str(exc))
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


def _safe_identifier(value: str) -> str:
    normalized = str(value or "").strip().replace(" ", "_")
    normalized = "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in normalized)
    return normalized[:48] or "target"

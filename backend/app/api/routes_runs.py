from __future__ import annotations

import copy
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Body, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import ValidationError

from app.core.langgraph import execute_node_system_graph_langgraph, get_langgraph_runtime_unsupported_reasons
from app.core.runtime.run_events import publish_run_event, subscribe_run_events
from app.core.runtime.state import set_run_status, touch_run_lifecycle
from app.core.schemas.node_system import NodeSystemGraphDocument
from app.core.schemas.run import NodeExecutionDetail, RunDetail, RunSummary
from app.core.storage.run_store import list_runs, load_run
from app.core.storage.run_store import save_run


router = APIRouter(prefix="/api/runs", tags=["runs"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[RunSummary])
def list_runs_endpoint(
    graph_name: str = Query(default=""),
    status: str = Query(default=""),
) -> list[RunSummary]:
    runs = [
        RunSummary.model_validate(
            {
                **run,
                "restorable_snapshot_available": _has_restorable_graph_snapshot(run.get("graph_snapshot")),
                "run_snapshot_options": _build_run_snapshot_options(run),
            }
        )
        for run in list_runs()
    ]
    graph_name_query = graph_name.strip().lower()
    status_query = status.strip().lower()

    if graph_name_query:
        runs = [run for run in runs if graph_name_query in run.graph_name.lower()]
    if status_query:
        runs = [run for run in runs if run.status.lower() == status_query]

    return runs


@router.get("/{run_id}", response_model=RunDetail)
def get_run_endpoint(run_id: str) -> RunDetail:
    try:
        run = load_run(run_id)
        return RunDetail.model_validate(
            {
                **run,
                "restorable_snapshot_available": _has_restorable_graph_snapshot(run.get("graph_snapshot")),
            }
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{run_id}/events")
def stream_run_events_endpoint(run_id: str) -> StreamingResponse:
    try:
        load_run(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return StreamingResponse(
        subscribe_run_events(run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{run_id}/nodes/{node_id}", response_model=NodeExecutionDetail)
def get_run_node_detail_endpoint(run_id: str, node_id: str) -> NodeExecutionDetail:
    try:
        run = load_run(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    for execution in run.get("node_executions", []):
        if execution.get("node_id") == node_id:
            return NodeExecutionDetail.model_validate(execution)

    raise HTTPException(
        status_code=404,
        detail=f"Node execution '{node_id}' does not exist in run '{run_id}'.",
    )


@router.post("/{run_id}/resume")
def resume_run_endpoint(
    run_id: str,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] | None = Body(default=None),
) -> dict[str, str]:
    try:
        previous_run = load_run(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if previous_run.get("runtime_backend") != "langgraph":
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' is not resumable because it did not use LangGraph runtime.")

    requested_snapshot_id = str((payload or {}).get("snapshot_id") or "").strip() or None
    resume_snapshot = _resolve_resume_snapshot(previous_run, requested_snapshot_id)
    checkpoint_metadata = _resolve_resume_checkpoint_metadata(previous_run, resume_snapshot)
    if not checkpoint_metadata.get("available") or not checkpoint_metadata.get("thread_id"):
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' does not have an available checkpoint.")

    if previous_run.get("status") not in {"failed", "paused", "awaiting_human"} and resume_snapshot is None:
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' cannot be resumed from status '{previous_run.get('status')}'.")

    graph_snapshot = (
        resume_snapshot.get("graph_snapshot")
        if isinstance(resume_snapshot, dict) and isinstance(resume_snapshot.get("graph_snapshot"), dict)
        else previous_run.get("graph_snapshot")
    )
    if not isinstance(graph_snapshot, dict):
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' cannot be resumed because its graph snapshot is missing.")

    try:
        graph = NodeSystemGraphDocument.model_validate(graph_snapshot)
    except ValidationError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Run '{run_id}' cannot be resumed because its graph snapshot is invalid.",
                "errors": exc.errors(),
            },
        ) from exc

    fallback_reasons = get_langgraph_runtime_unsupported_reasons(graph)
    if fallback_reasons:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Graph '{graph.graph_id}' can no longer be resumed on LangGraph runtime.",
                "reasons": fallback_reasons,
            },
        )

    resumed_run = copy.deepcopy(previous_run)
    if resume_snapshot is not None:
        resumed_run["status"] = str(resume_snapshot.get("status") or resumed_run.get("status") or "")
        resumed_run["current_node_id"] = resume_snapshot.get("current_node_id")
        resumed_run["checkpoint_metadata"] = copy.deepcopy(checkpoint_metadata)
        resumed_run["state_snapshot"] = copy.deepcopy(resume_snapshot.get("state_snapshot", resumed_run.get("state_snapshot", {})))
        resumed_run["graph_snapshot"] = copy.deepcopy(graph_snapshot)
        resumed_run["artifacts"] = copy.deepcopy(resume_snapshot.get("artifacts", resumed_run.get("artifacts", {})))
        resumed_run["node_status_map"] = copy.deepcopy(resume_snapshot.get("node_status_map", resumed_run.get("node_status_map", {})))
        resumed_run["output_previews"] = copy.deepcopy(resume_snapshot.get("output_previews", resumed_run.get("output_previews", [])))
        resumed_run["final_result"] = str(resume_snapshot.get("final_result", resumed_run.get("final_result", "")) or "")
    resumed_run["graph_id"] = graph.graph_id
    resumed_run["graph_name"] = graph.name
    resumed_run["runtime_backend"] = "langgraph"
    resumed_run["metadata"] = dict(graph.metadata)
    resumed_run["metadata"]["resolved_runtime_backend"] = "langgraph"
    resumed_run["checkpoint_metadata"] = {
        "available": bool(checkpoint_metadata.get("checkpoint_id")),
        "checkpoint_id": checkpoint_metadata.get("checkpoint_id"),
        "thread_id": checkpoint_metadata.get("thread_id"),
        "checkpoint_ns": checkpoint_metadata.get("checkpoint_ns") or "",
        "saver": checkpoint_metadata.get("saver") or "json_checkpoint_saver",
        "resume_source": run_id,
    }
    resumed_run["completed_at"] = None
    resumed_run["errors"] = []
    resumed_run["warnings"] = []
    set_run_status(resumed_run, "resuming")
    touch_run_lifecycle(resumed_run)
    save_run(resumed_run)

    background_tasks.add_task(_resume_run_worker, graph, resumed_run, payload.get("resume") if payload else None)
    return {"run_id": resumed_run["run_id"], "status": resumed_run["status"]}


def _resume_run_worker(graph, resumed_run: dict, resume_payload: Any | None = None) -> None:
    try:
        execute_node_system_graph_langgraph(
            graph,
            initial_state=resumed_run,
            persist_progress=True,
            resume_from_checkpoint=True,
            resume_command=resume_payload,
        )
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Failed to resume run %s: %s", resumed_run.get("run_id"), exc)
        set_run_status(resumed_run, "failed")
        resumed_run.setdefault("errors", []).append(str(exc))
        save_run(resumed_run)
        publish_run_event(
            str(resumed_run.get("run_id") or ""),
            "run.failed",
            {"status": "failed", "error": str(exc)},
        )


def _has_restorable_graph_snapshot(snapshot: Any) -> bool:
    if not isinstance(snapshot, dict):
        return False

    try:
        NodeSystemGraphDocument.model_validate(snapshot)
    except ValidationError:
        return False
    return True


def _build_run_snapshot_options(run: dict[str, Any]) -> list[dict[str, Any]]:
    snapshots = run.get("run_snapshots")
    if not isinstance(snapshots, list):
        return []

    options: list[dict[str, Any]] = []
    for snapshot in snapshots:
        if not isinstance(snapshot, dict):
            continue
        snapshot_id = str(snapshot.get("snapshot_id") or "").strip()
        kind = str(snapshot.get("kind") or "").strip()
        if not snapshot_id or kind not in {"pause", "completed", "failed"}:
            continue
        options.append(
            {
                "snapshot_id": snapshot_id,
                "kind": kind,
                "label": str(snapshot.get("label") or snapshot_id),
                "status": str(snapshot.get("status") or ""),
                "current_node_id": snapshot.get("current_node_id"),
            }
        )
    return options


def _resolve_resume_snapshot(previous_run: dict[str, Any], snapshot_id: str | None) -> dict[str, Any] | None:
    if not snapshot_id:
        return None
    snapshots = previous_run.get("run_snapshots")
    if not isinstance(snapshots, list):
        raise HTTPException(status_code=409, detail=f"Run '{previous_run.get('run_id')}' does not contain resumable snapshots.")
    snapshot = next((item for item in snapshots if isinstance(item, dict) and item.get("snapshot_id") == snapshot_id), None)
    if snapshot is None:
        raise HTTPException(status_code=404, detail=f"Snapshot '{snapshot_id}' does not exist in run '{previous_run.get('run_id')}'.")
    if str(snapshot.get("kind") or "").strip() != "pause":
        raise HTTPException(status_code=409, detail=f"Snapshot '{snapshot_id}' is not a pause checkpoint and cannot be resumed.")
    return snapshot


def _resolve_resume_checkpoint_metadata(previous_run: dict[str, Any], resume_snapshot: dict[str, Any] | None) -> dict[str, Any]:
    if resume_snapshot is None:
        return dict(previous_run.get("checkpoint_metadata") or {})
    return dict(resume_snapshot.get("checkpoint_metadata") or {})

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.core.langgraph import execute_node_system_graph_langgraph, resolve_graph_runtime_backend
from app.core.runtime.state import create_initial_run_state, set_run_status, touch_run_lifecycle
from app.core.schemas.run import NodeExecutionDetail, RunDetail, RunSummary
from app.core.storage.graph_store import load_graph
from app.core.storage.run_store import list_runs, load_run
from app.core.storage.run_store import save_run


router = APIRouter(prefix="/api/runs", tags=["runs"])
logger = logging.getLogger(__name__)


@router.get("", response_model=list[RunSummary])
def list_runs_endpoint(
    graph_name: str = Query(default=""),
    status: str = Query(default=""),
) -> list[RunSummary]:
    runs = [RunSummary.model_validate(run) for run in list_runs()]
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
        return RunDetail.model_validate(load_run(run_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


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
def resume_run_endpoint(run_id: str, background_tasks: BackgroundTasks) -> dict[str, str]:
    try:
        previous_run = load_run(run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if previous_run.get("runtime_backend") != "langgraph":
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' is not resumable because it did not use LangGraph runtime.")

    checkpoint_metadata = dict(previous_run.get("checkpoint_metadata") or {})
    if not checkpoint_metadata.get("available") or not checkpoint_metadata.get("thread_id"):
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' does not have an available checkpoint.")

    if previous_run.get("status") not in {"failed", "paused", "awaiting_human"}:
        raise HTTPException(status_code=409, detail=f"Run '{run_id}' cannot be resumed from status '{previous_run.get('status')}'.")

    try:
        graph = load_graph(str(previous_run["graph_id"]))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    runtime_backend, fallback_reasons = resolve_graph_runtime_backend(graph)
    if runtime_backend != "langgraph":
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"Graph '{graph.graph_id}' can no longer be resumed on LangGraph runtime.",
                "reasons": fallback_reasons,
            },
        )

    resumed_run = create_initial_run_state(
        graph_id=graph.graph_id,
        graph_name=graph.name,
        max_revision_round=int(graph.metadata.get("max_revision_round", 1)),
    )
    resumed_run["runtime_backend"] = "langgraph"
    resumed_run["metadata"] = dict(graph.metadata)
    resumed_run["metadata"]["resolved_runtime_backend"] = "langgraph"
    resumed_run["node_status_map"] = {node_name: "idle" for node_name in graph.nodes}
    resumed_run["checkpoint_metadata"] = {
        "available": bool(checkpoint_metadata.get("checkpoint_id")),
        "checkpoint_id": checkpoint_metadata.get("checkpoint_id"),
        "thread_id": checkpoint_metadata.get("thread_id"),
        "checkpoint_ns": checkpoint_metadata.get("checkpoint_ns") or "",
        "saver": checkpoint_metadata.get("saver") or "json_checkpoint_saver",
        "resume_source": run_id,
    }
    set_run_status(resumed_run, "resuming", resumed_from_run_id=run_id)
    touch_run_lifecycle(resumed_run)
    save_run(resumed_run)

    background_tasks.add_task(_resume_run_worker, graph, resumed_run)
    return {"run_id": resumed_run["run_id"], "status": resumed_run["status"]}


def _resume_run_worker(graph, resumed_run: dict) -> None:
    try:
        execute_node_system_graph_langgraph(
            graph,
            initial_state=resumed_run,
            persist_progress=True,
            resume_from_checkpoint=True,
        )
    except Exception as exc:  # pragma: no cover - defensive runtime path
        logger.exception("Failed to resume run %s: %s", resumed_run.get("run_id"), exc)
        set_run_status(resumed_run, "failed")
        resumed_run.setdefault("errors", []).append(str(exc))
        save_run(resumed_run)

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.schemas.run import NodeExecutionDetail, RunDetail, RunSummary
from app.core.storage.run_store import list_runs, load_run


router = APIRouter(prefix="/api/runs", tags=["runs"])


@router.get("", response_model=list[RunSummary])
def list_runs_endpoint() -> list[RunSummary]:
    return [RunSummary.model_validate(run) for run in list_runs()]


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

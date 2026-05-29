from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.scheduler import delivery, runner, store


router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])


@router.get("/jobs")
def list_scheduled_graph_jobs(include_disabled: bool = Query(default=False)) -> list[dict[str, Any]]:
    return store.list_scheduled_graph_jobs(include_disabled=include_disabled)


@router.post("/jobs")
def create_scheduled_graph_job(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return store.create_scheduled_graph_job(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/jobs/due")
def list_due_scheduled_graph_jobs(now: str = Query(default=""), limit: int = Query(default=25, ge=1, le=100)) -> list[dict[str, Any]]:
    try:
        return store.list_due_scheduled_graph_jobs(now=now or None, limit=limit)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/jobs/run-due")
def run_due_scheduled_graph_jobs(
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_payload = payload or {}
    try:
        return runner.run_due_scheduled_graph_jobs(
            background_tasks=background_tasks,
            now=str(request_payload.get("now") or "") or None,
            limit=int(request_payload.get("limit") or 25),
            requested_by=str(request_payload.get("requested_by") or "scheduler"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/jobs/{job_id}")
def get_scheduled_graph_job(job_id: str) -> dict[str, Any]:
    try:
        return store.load_scheduled_graph_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Scheduled graph job '{job_id}' does not exist.") from exc


@router.patch("/jobs/{job_id}")
def update_scheduled_graph_job(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return store.update_scheduled_graph_job(job_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Scheduled graph job '{job_id}' does not exist.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.patch("/jobs/{job_id}/enabled")
def set_scheduled_graph_job_enabled(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return store.set_scheduled_graph_job_enabled(job_id, payload.get("enabled") is not False)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Scheduled graph job '{job_id}' does not exist.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/jobs/{job_id}/runs")
def list_scheduled_graph_job_runs(job_id: str) -> list[dict[str, Any]]:
    try:
        store.load_scheduled_graph_job(job_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Scheduled graph job '{job_id}' does not exist.") from exc
    return store.list_scheduled_graph_job_runs(job_id=job_id)


@router.post("/jobs/{job_id}/run")
def run_scheduled_graph_job(
    job_id: str,
    background_tasks: BackgroundTasks,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_payload = payload or {}
    try:
        return runner.start_scheduled_graph_job_run(
            job_id,
            background_tasks=background_tasks,
            trigger_reason=str(request_payload.get("trigger_reason") or "manual"),
            requested_by=str(request_payload.get("requested_by") or ""),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Scheduled graph job '{job_id}' does not exist.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/jobs/{job_id}/runs/{job_run_id}/delivery/approve")
def approve_scheduled_graph_job_run_delivery(
    job_id: str,
    job_run_id: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request_payload = payload or {}
    try:
        job_run = store.load_scheduled_graph_job_run(job_run_id)
        if job_run["job_id"] != job_id:
            raise KeyError(job_run_id)
        approval_payload = request_payload.get("approval") if isinstance(request_payload.get("approval"), dict) else {}
        return delivery.execute_approved_scheduled_delivery(
            job_run_id,
            approval={
                "decision": approval_payload.get("decision") or request_payload.get("decision") or "approved",
                "approved_by": approval_payload.get("approved_by") or request_payload.get("approved_by") or "scheduler_api",
                "reason": approval_payload.get("reason") or request_payload.get("reason") or "",
            },
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"Scheduled graph job run '{job_run_id}' does not exist.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

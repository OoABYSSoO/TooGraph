from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.storage.model_log_store import list_model_request_logs


router = APIRouter(prefix="/api/model-logs", tags=["model-logs"])


@router.get("")
def list_model_logs_endpoint(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    q: str = Query(default=""),
) -> dict:
    return list_model_request_logs(page=page, size=size, query=q)

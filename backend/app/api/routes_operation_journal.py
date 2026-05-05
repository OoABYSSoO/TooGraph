from __future__ import annotations

from fastapi import APIRouter, Query

from app.core.storage.operation_journal_store import list_operation_journal_entries


router = APIRouter(prefix="/api/operation-journal", tags=["operation-journal"])


@router.get("")
def list_operation_journal_endpoint(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=50, ge=1, le=200),
    run_id: str = Query(default=""),
    operation_request_id: str = Query(default=""),
    status: str = Query(default=""),
) -> dict:
    return list_operation_journal_entries(
        page=page,
        size=size,
        run_id=run_id,
        operation_request_id=operation_request_id,
        status=status,
    )

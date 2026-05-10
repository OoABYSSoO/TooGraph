from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from app.memory import store


router = APIRouter(prefix="/api/memories", tags=["memories"])


class MemoryLifecyclePayload(BaseModel):
    change_reason: str = "User changed platform memory lifecycle state."

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class MemoryDegradePayload(MemoryLifecyclePayload):
    amount: float = Field(default=0.1, ge=0, le=1)


class MemoryRestorePayload(MemoryLifecyclePayload):
    target: Literal["previous", "next"] = "previous"


class MemoryReplacePayload(MemoryLifecyclePayload):
    supersedes: list[str] | None = None


@router.get("")
def list_memories_endpoint(
    scope: str = Query(default=""),
    layer: str = Query(default=""),
    memory_type: str = Query(default=""),
    status: str = Query(default=""),
    include_inactive: bool = Query(default=False),
) -> list[dict[str, Any]]:
    return store.list_memories(
        scope=scope or None,
        layer=layer or None,
        memory_type=memory_type or None,
        status=status or None,
        include_inactive=include_inactive,
    )


@router.post("/{memory_id}/apply")
def apply_memory_endpoint(memory_id: str, payload: MemoryLifecyclePayload) -> dict[str, Any]:
    try:
        return store.apply_memory_candidate(memory_id, changed_by="user", change_reason=payload.change_reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory not found") from exc


@router.post("/{memory_id}/reject")
def reject_memory_endpoint(memory_id: str, payload: MemoryLifecyclePayload) -> dict[str, Any]:
    try:
        return store.reject_memory_candidate(memory_id, changed_by="user", change_reason=payload.change_reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory not found") from exc


@router.post("/{memory_id}/replace")
def replace_memory_endpoint(memory_id: str, payload: MemoryReplacePayload) -> dict[str, Any]:
    try:
        return store.replace_memory_candidate(
            memory_id,
            supersedes=payload.supersedes,
            changed_by="user",
            change_reason=payload.change_reason,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory or superseded memory not found") from exc


@router.post("/{memory_id}/archive")
def archive_memory_endpoint(memory_id: str, payload: MemoryLifecyclePayload) -> dict[str, Any]:
    try:
        return store.archive_memory(memory_id, changed_by="user", change_reason=payload.change_reason)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory not found") from exc


@router.post("/{memory_id}/degrade")
def degrade_memory_endpoint(memory_id: str, payload: MemoryDegradePayload) -> dict[str, Any]:
    try:
        return store.degrade_memory(
            memory_id,
            amount=payload.amount,
            changed_by="user",
            change_reason=payload.change_reason,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory not found") from exc


@router.get("/{memory_id}/revisions")
def list_memory_revisions_endpoint(memory_id: str) -> list[dict[str, Any]]:
    if not _memory_exists(memory_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return store.list_memory_revisions(memory_id)


@router.get("/{memory_id}/events")
def list_memory_events_endpoint(memory_id: str) -> list[dict[str, Any]]:
    if not _memory_exists(memory_id):
        raise HTTPException(status_code=404, detail="Memory not found")
    return store.list_memory_events(memory_id)


@router.post("/{memory_id}/revisions/{revision_id}/restore")
def restore_memory_revision_endpoint(
    memory_id: str,
    revision_id: str,
    payload: MemoryRestorePayload,
) -> dict[str, Any]:
    try:
        return store.restore_memory_revision(
            memory_id,
            revision_id,
            target=payload.target,
            changed_by="user",
            change_reason=payload.change_reason,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory or revision not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def _memory_exists(memory_id: str) -> bool:
    try:
        store.get_memory(memory_id)
    except KeyError:
        return False
    return True

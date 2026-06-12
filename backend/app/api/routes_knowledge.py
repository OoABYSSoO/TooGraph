from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.core.storage.knowledge_store import (
    DEFAULT_TEMPLATE_ID,
    import_knowledge_folder,
    list_knowledge_bases,
    pause_knowledge_indexing_operation,
    record_knowledge_base_run,
    retry_knowledge_base_indexing,
    resume_knowledge_indexing_operation,
    retry_knowledge_indexing_operation,
)
from app.scheduler import runner


router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class KnowledgeFolderImportPayload(BaseModel):
    name: str
    source_path: str
    collection_id: str | None = None
    template_id: str = DEFAULT_TEMPLATE_ID


class KnowledgeRunRecordPayload(BaseModel):
    run_id: str
    template_id: str | None = None
    operation_id: str | None = None


@router.get("/bases")
def list_knowledge_bases_endpoint() -> dict[str, list[dict[str, Any]]]:
    return {"bases": list_knowledge_bases()}


@router.post("/imports/folder")
def import_knowledge_folder_endpoint(payload: KnowledgeFolderImportPayload) -> dict[str, Any]:
    try:
        return import_knowledge_folder(
            name=payload.name,
            source_path=payload.source_path,
            collection_id=payload.collection_id,
            template_id=payload.template_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/bases/{collection_id}/runs")
def record_knowledge_run_endpoint(
    collection_id: str,
    payload: KnowledgeRunRecordPayload,
) -> dict[str, Any]:
    try:
        return record_knowledge_base_run(
            collection_id,
            run_id=payload.run_id,
            template_id=payload.template_id,
            operation_id=payload.operation_id,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/bases/{collection_id}/operations/{operation_id}/retry")
def retry_knowledge_operation_endpoint(
    collection_id: str,
    operation_id: str,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    try:
        base = retry_knowledge_indexing_operation(collection_id, operation_id)
        if _should_schedule_embedding_drain(base):
            runner.run_event_scheduled_graph_jobs(
                "knowledge.ingestion.completed",
                event={
                    "collection_id": base["collection_id"],
                    "operation_id": str(operation_id or "").strip(),
                },
                background_tasks=background_tasks,
                requested_by="knowledge_operation_retry",
            )
        return base
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/bases/{collection_id}/retry")
def retry_knowledge_base_endpoint(
    collection_id: str,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    try:
        base = retry_knowledge_base_indexing(collection_id)
        operation = base.get("current_operation") if isinstance(base.get("current_operation"), dict) else {}
        if _should_schedule_embedding_drain(base):
            runner.run_event_scheduled_graph_jobs(
                "knowledge.ingestion.completed",
                event={
                    "collection_id": base["collection_id"],
                    "operation_id": str(operation.get("operation_id") or ""),
                },
                background_tasks=background_tasks,
                requested_by="knowledge_collection_retry",
            )
        return base
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/bases/{collection_id}/operations/{operation_id}/pause")
def pause_knowledge_operation_endpoint(collection_id: str, operation_id: str) -> dict[str, Any]:
    try:
        return pause_knowledge_indexing_operation(collection_id, operation_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/bases/{collection_id}/operations/{operation_id}/resume")
def resume_knowledge_operation_endpoint(
    collection_id: str,
    operation_id: str,
    background_tasks: BackgroundTasks,
) -> dict[str, Any]:
    try:
        base = resume_knowledge_indexing_operation(collection_id, operation_id)
        if _should_schedule_embedding_drain(base):
            runner.run_event_scheduled_graph_jobs(
                "knowledge.ingestion.completed",
                event={
                    "collection_id": base["collection_id"],
                    "operation_id": str(operation_id or "").strip(),
                },
                background_tasks=background_tasks,
                requested_by="knowledge_operation_resume",
            )
        return base
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _should_schedule_embedding_drain(base: dict[str, Any]) -> bool:
    operation = base.get("current_operation") if isinstance(base.get("current_operation"), dict) else {}
    return str(operation.get("status") or "") == "embedding"

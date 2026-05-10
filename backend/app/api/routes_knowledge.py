from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.knowledge.loader import list_knowledge_bases as load_knowledge_bases
from app.knowledge.loader import rebuild_knowledge_base_embeddings
from app.knowledge.loader import search_knowledge


router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


class KnowledgeRebuildRequest(BaseModel):
    provider: str = Field(default="local-hash")
    model: str = Field(default="hashing-v1")
    dimension: int = Field(default=384, ge=16, le=2048)


@router.get("")
def list_knowledge_endpoint(
    query: str = Query(default=""),
    knowledge_base: str | None = Query(default=None, alias="knowledge_base"),
    source_path_prefix: str = Query(default=""),
    source_kind: str = Query(default=""),
    section: str = Query(default=""),
) -> list[dict[str, object]]:
    try:
        return search_knowledge(
            query,
            knowledge_base=knowledge_base,
            limit=20,
            metadata_filter={
                "source_path_prefix": source_path_prefix,
                "source_kind": source_kind,
                "section": section,
            },
        )
    except ValueError as exc:
        if "No knowledge bases" in str(exc):
            return []
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/bases")
def list_knowledge_bases() -> list[dict[str, object]]:
    return load_knowledge_bases()


@router.post("/bases/{knowledge_base}/rebuild")
def rebuild_knowledge_base_endpoint(knowledge_base: str, payload: KnowledgeRebuildRequest) -> dict[str, object]:
    try:
        return rebuild_knowledge_base_embeddings(
            knowledge_base,
            provider=payload.provider,
            model=payload.model,
            dimension=payload.dimension,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

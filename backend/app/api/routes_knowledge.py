from __future__ import annotations

from fastapi import APIRouter, Query

from app.knowledge.loader import list_knowledge_bases as load_knowledge_bases
from app.knowledge.loader import search_knowledge


router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("")
def list_knowledge_endpoint(
    query: str = Query(default=""),
    knowledge_base: str | None = Query(default=None, alias="knowledge_base"),
) -> list[dict[str, object]]:
    return search_knowledge(query, knowledge_base=knowledge_base, limit=20)


@router.get("/bases")
def list_knowledge_bases() -> list[dict[str, object]]:
    return load_knowledge_bases()

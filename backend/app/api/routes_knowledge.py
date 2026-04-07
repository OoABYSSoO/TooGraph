from __future__ import annotations

from fastapi import APIRouter, Query

from app.knowledge.loader import search_knowledge


router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("")
def list_knowledge_endpoint(query: str = Query(default="")) -> list[dict[str, str]]:
    return search_knowledge(query, limit=20)


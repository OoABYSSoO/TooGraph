from __future__ import annotations

from fastapi import APIRouter, Query

from app.memory.store import load_memories


router = APIRouter(prefix="/api/memories", tags=["memories"])


@router.get("")
def list_memories_endpoint(memory_type: str = Query(default="")) -> list[dict]:
    return load_memories(memory_type=memory_type or None)


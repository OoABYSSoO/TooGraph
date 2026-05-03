from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.storage.skill_artifact_store import read_skill_artifact_text


router = APIRouter(prefix="/api/skill-artifacts", tags=["skill-artifacts"])


@router.get("/content")
def get_skill_artifact_content(path: str = Query(..., min_length=1)) -> dict[str, object]:
    try:
        return read_skill_artifact_text(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

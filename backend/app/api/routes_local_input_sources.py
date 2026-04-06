from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.storage.local_input_sources import list_local_folder


router = APIRouter(prefix="/api/local-input-sources", tags=["local-input-sources"])


@router.get("/folder")
def get_local_folder_tree(path: str = Query(..., min_length=1)) -> dict[str, object]:
    try:
        return list_local_folder(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.storage.skill_artifact_store import (
    create_uploaded_skill_artifact,
    read_skill_artifact_file_metadata,
    read_skill_artifact_text,
)


router = APIRouter(prefix="/api/skill-artifacts", tags=["skill-artifacts"])


@router.get("/content")
def get_skill_artifact_content(path: str = Query(..., min_length=1)) -> dict[str, object]:
    try:
        return read_skill_artifact_text(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/file")
def get_skill_artifact_file(path: str = Query(..., min_length=1)) -> FileResponse:
    try:
        metadata = read_skill_artifact_file_metadata(path)
        return FileResponse(
            metadata["filesystem_path"],
            media_type=str(metadata["content_type"]),
            filename=str(metadata["name"]),
            content_disposition_type="inline",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/uploads")
async def upload_skill_artifact_file(file: UploadFile = File(...)) -> dict[str, object]:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return create_uploaded_skill_artifact(
        file_name=file.filename or "upload.bin",
        content_type=file.content_type or "",
        payload=payload,
    )

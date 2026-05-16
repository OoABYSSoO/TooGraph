from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.storage.capability_artifact_store import (
    create_uploaded_capability_artifact,
    read_capability_artifact_file_metadata,
    read_capability_artifact_text,
)


router = APIRouter(prefix="/api/capability-artifacts", tags=["capability-artifacts"])


@router.get("/content")
def get_capability_artifact_content(path: str = Query(..., min_length=1)) -> dict[str, object]:
    try:
        return read_capability_artifact_text(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/file")
def get_capability_artifact_file(path: str = Query(..., min_length=1)) -> FileResponse:
    try:
        metadata = read_capability_artifact_file_metadata(path)
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
async def upload_capability_artifact_file(file: UploadFile = File(...)) -> dict[str, object]:
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return create_uploaded_capability_artifact(
        file_name=file.filename or "upload.bin",
        content_type=file.content_type or "",
        payload=payload,
    )

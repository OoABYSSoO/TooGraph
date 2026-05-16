from __future__ import annotations

from pathlib import Path, PurePosixPath
import tempfile
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.core.schemas.actions import ActionDefinition, ActionFileContentResponse, ActionFileTreeResponse
from app.core.storage.action_store import (
    delete_action,
    disable_action,
    enable_action,
    extract_action_archive,
    import_action_from_directory,
)
from app.actions.definitions import (
    get_action_catalog_registry,
    list_action_catalog,
    list_action_definitions,
)
from app.actions.files import build_action_file_tree, read_action_file_content


router = APIRouter(prefix="/api/actions", tags=["actions"])


@router.get("/definitions", response_model=list[ActionDefinition])
def list_action_definitions_endpoint(include_disabled: bool = False) -> list[ActionDefinition]:
    return list_action_definitions(include_disabled=include_disabled)


@router.get("/catalog", response_model=list[ActionDefinition])
def list_action_catalog_endpoint(include_disabled: bool = True) -> list[ActionDefinition]:
    return list_action_catalog(include_disabled=include_disabled)


@router.post("/imports/upload", response_model=ActionDefinition)
async def import_uploaded_action_endpoint(
    files: list[UploadFile] = File(...),
    relative_paths: list[str] | None = Form(default=None, alias="relativePaths"),
) -> ActionDefinition:
    if not files:
        raise HTTPException(status_code=400, detail="Upload an Action archive or folder.")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            upload_root = temp_root / "upload"
            if len(files) == 1 and _is_zip_upload(files[0]):
                archive_path = temp_root / "action.zip"
                await _write_upload_file(files[0], archive_path)
                source_root = extract_action_archive(archive_path, upload_root)
            else:
                source_root = upload_root
                await _write_uploaded_folder(files, relative_paths or [], source_root)
            action_key = import_action_from_directory(source_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    definition = get_action_catalog_registry(include_disabled=True).get(action_key)
    if definition is None:
        raise HTTPException(status_code=500, detail=f"Imported Action '{action_key}' could not be loaded.")
    return definition


@router.post("/{action_key}/disable", response_model=ActionDefinition)
def disable_action_endpoint(action_key: str) -> ActionDefinition:
    definition = get_action_catalog_registry(include_disabled=True).get(action_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Action '{action_key}' does not exist.")
    disable_action(action_key)
    return get_action_catalog_registry(include_disabled=True)[action_key]


@router.post("/{action_key}/enable", response_model=ActionDefinition)
def enable_action_endpoint(action_key: str) -> ActionDefinition:
    definition = get_action_catalog_registry(include_disabled=True).get(action_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Action '{action_key}' does not exist.")
    enable_action(action_key)
    return get_action_catalog_registry(include_disabled=True)[action_key]


@router.patch("/{action_key}/settings")
def update_action_settings_endpoint(action_key: str, payload: dict[str, Any] | None = None) -> None:
    _ = payload
    definition = get_action_catalog_registry(include_disabled=True).get(action_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Action '{action_key}' does not exist.")
    raise HTTPException(
        status_code=410,
        detail="Action capability policies were removed; enable or disable the action to control visibility.",
    )


@router.get("/{action_key}/files", response_model=ActionFileTreeResponse)
def get_action_files_endpoint(action_key: str) -> ActionFileTreeResponse:
    definition = get_action_catalog_registry(include_disabled=True).get(action_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Action '{action_key}' does not exist.")
    try:
        return build_action_file_tree(definition)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{action_key}/files/content", response_model=ActionFileContentResponse)
def get_action_file_content_endpoint(action_key: str, path: str = Query(..., min_length=1)) -> ActionFileContentResponse:
    definition = get_action_catalog_registry(include_disabled=True).get(action_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Action '{action_key}' does not exist.")
    try:
        return read_action_file_content(definition, path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{action_key}")
def delete_action_endpoint(action_key: str) -> dict[str, str]:
    definition = get_action_catalog_registry(include_disabled=True).get(action_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Action '{action_key}' does not exist.")
    if not definition.can_manage:
        raise HTTPException(status_code=400, detail="Only imported TooGraph actions can be deleted.")
    delete_action(action_key)
    return {"actionKey": action_key, "status": "deleted"}


def _is_zip_upload(upload: UploadFile) -> bool:
    filename = (upload.filename or "").lower()
    content_type = (upload.content_type or "").lower()
    return filename.endswith(".zip") or content_type in {"application/zip", "application/x-zip-compressed"}


async def _write_upload_file(upload: UploadFile, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        while chunk := await upload.read(1024 * 1024):
            output.write(chunk)


async def _write_uploaded_folder(files: list[UploadFile], relative_paths: list[str], destination: Path) -> None:
    if relative_paths and len(relative_paths) != len(files):
        raise ValueError("Uploaded folder paths do not match uploaded files.")
    destination.mkdir(parents=True, exist_ok=True)
    for index, upload in enumerate(files):
        relative_path = relative_paths[index] if relative_paths else (upload.filename or "")
        target = _safe_uploaded_child_path(destination, relative_path)
        await _write_upload_file(upload, target)


def _safe_uploaded_child_path(root: Path, relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    path = PurePosixPath(normalized)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        raise ValueError("Uploaded Action contains an unsafe path.")
    target = (root / Path(*path.parts)).resolve()
    root_resolved = root.resolve()
    if not target.is_relative_to(root_resolved):
        raise ValueError("Uploaded Action contains an unsafe path.")
    return target

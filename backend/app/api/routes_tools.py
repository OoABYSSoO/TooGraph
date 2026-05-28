from __future__ import annotations

from pathlib import Path, PurePosixPath
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.core.schemas.tools import ToolDefinition, ToolFileContentResponse, ToolFileTreeResponse
from app.core.storage.tool_store import (
    delete_tool,
    disable_tool,
    enable_tool,
    extract_tool_archive,
    import_tool_from_directory,
)
from app.graph_tools.definitions import get_tool_catalog_registry, list_tool_catalog
from app.graph_tools.files import build_tool_file_tree, read_tool_file_content


router = APIRouter(prefix="/api/tools", tags=["tools"])


@router.get("/catalog", response_model=list[ToolDefinition])
def list_tool_catalog_endpoint(include_disabled: bool = True) -> list[ToolDefinition]:
    return list_tool_catalog(include_disabled=include_disabled)


@router.post("/imports/upload", response_model=ToolDefinition)
async def import_uploaded_tool_endpoint(
    files: list[UploadFile] = File(...),
    relative_paths: list[str] | None = Form(default=None, alias="relativePaths"),
) -> ToolDefinition:
    if not files:
        raise HTTPException(status_code=400, detail="Upload a Tool archive or folder.")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            upload_root = temp_root / "upload"
            if len(files) == 1 and _is_zip_upload(files[0]):
                archive_path = temp_root / "tool.zip"
                await _write_upload_file(files[0], archive_path)
                source_root = extract_tool_archive(archive_path, upload_root)
            else:
                source_root = upload_root
                await _write_uploaded_folder(files, relative_paths or [], source_root)
            tool_key = import_tool_from_directory(source_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    definition = get_tool_catalog_registry(include_disabled=True).get(tool_key)
    if definition is None:
        raise HTTPException(status_code=500, detail=f"Imported Tool '{tool_key}' could not be loaded.")
    return definition


@router.post("/{tool_key}/disable", response_model=ToolDefinition)
def disable_tool_endpoint(tool_key: str) -> ToolDefinition:
    definition = get_tool_catalog_registry(include_disabled=True).get(tool_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_key}' does not exist.")
    disable_tool(tool_key)
    return get_tool_catalog_registry(include_disabled=True)[tool_key]


@router.post("/{tool_key}/enable", response_model=ToolDefinition)
def enable_tool_endpoint(tool_key: str) -> ToolDefinition:
    definition = get_tool_catalog_registry(include_disabled=True).get(tool_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_key}' does not exist.")
    enable_tool(tool_key)
    return get_tool_catalog_registry(include_disabled=True)[tool_key]


@router.get("/{tool_key}/files", response_model=ToolFileTreeResponse)
def get_tool_files_endpoint(tool_key: str) -> ToolFileTreeResponse:
    definition = get_tool_catalog_registry(include_disabled=True).get(tool_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_key}' does not exist.")
    try:
        return build_tool_file_tree(definition)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{tool_key}/files/content", response_model=ToolFileContentResponse)
def get_tool_file_content_endpoint(tool_key: str, path: str = Query(..., min_length=1)) -> ToolFileContentResponse:
    definition = get_tool_catalog_registry(include_disabled=True).get(tool_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_key}' does not exist.")
    try:
        return read_tool_file_content(definition, path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{tool_key}")
def delete_tool_endpoint(tool_key: str) -> dict[str, str]:
    definition = get_tool_catalog_registry(include_disabled=True).get(tool_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Tool '{tool_key}' does not exist.")
    if not definition.can_manage:
        raise HTTPException(status_code=400, detail="Only imported TooGraph tools can be deleted.")
    delete_tool(tool_key)
    return {"toolKey": tool_key, "status": "deleted"}


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
        raise ValueError("Uploaded Tool contains an unsafe path.")
    target = (root / Path(*path.parts)).resolve()
    root_resolved = root.resolve()
    if not target.is_relative_to(root_resolved):
        raise ValueError("Uploaded Tool contains an unsafe path.")
    return target

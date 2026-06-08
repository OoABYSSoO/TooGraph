from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, Query

from app.core.storage.local_input_sources import (
    list_local_directory_entries,
    list_local_folder,
    list_local_picker_directory_entries,
)
from app.core.storage.local_workspace_store import (
    create_or_open_local_workspace,
    get_local_workspace,
    list_local_workspaces,
    set_current_local_workspace,
)


router = APIRouter(prefix="/api/local-input-sources", tags=["local-input-sources"])


class LocalWorkspaceCreateRequest(BaseModel):
    root_path: str
    name: str | None = None


class LocalWorkspaceCurrentRequest(BaseModel):
    workspace_id: str


@router.get("/workspaces")
def get_local_workspaces() -> dict[str, object]:
    return list_local_workspaces()


@router.post("/workspaces")
def create_local_workspace(request: LocalWorkspaceCreateRequest) -> dict[str, object]:
    try:
        return create_or_open_local_workspace(request.root_path, name=request.name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workspaces/current")
def set_current_workspace(request: LocalWorkspaceCurrentRequest) -> dict[str, object]:
    try:
        return set_current_local_workspace(request.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/folder")
def get_local_folder_tree(path: str = Query(..., min_length=1)) -> dict[str, object]:
    try:
        return list_local_folder(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/entries")
def get_local_directory_entries(
    path: str = Query(..., min_length=1),
    workspace_id: str = Query(default=""),
) -> dict[str, object]:
    try:
        read_roots = None
        if workspace_id.strip():
            workspace = get_local_workspace(workspace_id)
            read_roots = [workspace["root_path"]]
        return list_local_directory_entries(path, read_roots=read_roots)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/picker/entries")
def get_local_picker_directory_entries(path: str = Query(default="")) -> dict[str, object]:
    try:
        return list_local_picker_directory_entries(path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

from __future__ import annotations

from pathlib import Path, PurePosixPath
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from app.core.schemas.skills import SkillDefinition, SkillFileContentResponse, SkillFileTreeResponse
from app.core.storage.skill_store import (
    delete_skill,
    disable_skill,
    enable_skill,
    extract_skill_archive,
    import_skill_from_directory,
    import_skill_from_source,
)
from app.skills.definitions import (
    get_external_skill_catalog_registry,
    get_skill_catalog_registry,
    list_skill_catalog,
    list_skill_definitions,
)
from app.skills.files import build_skill_file_tree, read_skill_file_content


router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("/definitions", response_model=list[SkillDefinition])
def list_skill_definitions_endpoint(include_disabled: bool = False) -> list[SkillDefinition]:
    return list_skill_definitions(include_disabled=include_disabled)


@router.get("/catalog", response_model=list[SkillDefinition])
def list_skill_catalog_endpoint(include_disabled: bool = True) -> list[SkillDefinition]:
    return list_skill_catalog(include_disabled=include_disabled)


@router.post("/imports/upload", response_model=SkillDefinition)
async def import_uploaded_skill_endpoint(
    files: list[UploadFile] = File(...),
    relative_paths: list[str] | None = Form(default=None, alias="relativePaths"),
) -> SkillDefinition:
    if not files:
        raise HTTPException(status_code=400, detail="Upload a Skill archive or folder.")
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            upload_root = temp_root / "upload"
            if len(files) == 1 and _is_zip_upload(files[0]):
                archive_path = temp_root / "skill.zip"
                await _write_upload_file(files[0], archive_path)
                source_root = extract_skill_archive(archive_path, upload_root)
            else:
                source_root = upload_root
                await _write_uploaded_folder(files, relative_paths or [], source_root)
            skill_key = import_skill_from_directory(source_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    definition = get_skill_catalog_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=500, detail=f"Imported Skill '{skill_key}' could not be loaded.")
    return definition


@router.post("/{skill_key}/import", response_model=SkillDefinition)
def import_skill_endpoint(skill_key: str) -> SkillDefinition:
    definition = get_external_skill_catalog_registry().get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"External skill '{skill_key}' does not exist.")
    if not definition.can_import:
        raise HTTPException(
            status_code=400,
            detail="This skill is discoverable only. Import is available only for runtime-supported skills.",
        )
    import_skill_from_source(skill_key=skill_key, source_path=definition.source_path)
    return get_skill_catalog_registry(include_disabled=True)[skill_key]


@router.post("/{skill_key}/disable", response_model=SkillDefinition)
def disable_skill_endpoint(skill_key: str) -> SkillDefinition:
    definition = get_skill_catalog_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    if not definition.can_manage:
        raise HTTPException(status_code=400, detail="Import the skill into GraphiteUI before managing it.")
    disable_skill(skill_key)
    return get_skill_catalog_registry(include_disabled=True)[skill_key]


@router.post("/{skill_key}/enable", response_model=SkillDefinition)
def enable_skill_endpoint(skill_key: str) -> SkillDefinition:
    definition = get_skill_catalog_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    if not definition.can_manage:
        raise HTTPException(status_code=400, detail="Import the skill into GraphiteUI before managing it.")
    enable_skill(skill_key)
    return get_skill_catalog_registry(include_disabled=True)[skill_key]


@router.get("/{skill_key}/files", response_model=SkillFileTreeResponse)
def get_skill_files_endpoint(skill_key: str) -> SkillFileTreeResponse:
    definition = get_skill_catalog_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    try:
        return build_skill_file_tree(definition)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{skill_key}/files/content", response_model=SkillFileContentResponse)
def get_skill_file_content_endpoint(skill_key: str, path: str = Query(..., min_length=1)) -> SkillFileContentResponse:
    definition = get_skill_catalog_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    try:
        return read_skill_file_content(definition, path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{skill_key}")
def delete_skill_endpoint(skill_key: str) -> dict[str, str]:
    definition = get_skill_catalog_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    if not definition.can_manage:
        raise HTTPException(status_code=400, detail="Only imported GraphiteUI skills can be deleted.")
    delete_skill(skill_key)
    return {"skillKey": skill_key, "status": "deleted"}


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
        raise ValueError("Uploaded Skill contains an unsafe path.")
    target = (root / Path(*path.parts)).resolve()
    root_resolved = root.resolve()
    if not target.is_relative_to(root_resolved):
        raise ValueError("Uploaded Skill contains an unsafe path.")
    return target

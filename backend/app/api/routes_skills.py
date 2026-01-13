from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.schemas.skills import SkillDefinition
from app.core.storage.skill_store import delete_skill, disable_skill, enable_skill, import_skill_from_source
from app.skills.definitions import (
    get_external_skill_catalog_registry,
    get_skill_catalog_registry,
    list_skill_catalog,
    list_skill_definitions,
)


router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("/definitions", response_model=list[SkillDefinition])
def list_skill_definitions_endpoint(include_disabled: bool = False) -> list[SkillDefinition]:
    return list_skill_definitions(include_disabled=include_disabled)


@router.get("/catalog", response_model=list[SkillDefinition])
def list_skill_catalog_endpoint(include_disabled: bool = True) -> list[SkillDefinition]:
    return list_skill_catalog(include_disabled=include_disabled)


@router.post("/{skill_key}/import", response_model=SkillDefinition)
def import_skill_endpoint(skill_key: str) -> SkillDefinition:
    definition = get_external_skill_catalog_registry().get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"External skill '{skill_key}' does not exist.")
    import_skill_from_source(
        skill_key=skill_key,
        source_format=definition.source_format,
        source_path=definition.source_path,
    )
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


@router.delete("/{skill_key}")
def delete_skill_endpoint(skill_key: str) -> dict[str, str]:
    definition = get_skill_catalog_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    if not definition.can_manage:
        raise HTTPException(status_code=400, detail="Only imported GraphiteUI skills can be deleted.")
    delete_skill(skill_key)
    return {"skillKey": skill_key, "status": "deleted"}

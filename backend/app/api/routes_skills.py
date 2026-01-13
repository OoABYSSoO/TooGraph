from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.schemas.skills import SkillDefinition
from app.core.storage.skill_store import delete_skill, disable_skill, enable_skill
from app.skills.definitions import get_skill_definition_registry, list_skill_definitions


router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("/definitions", response_model=list[SkillDefinition])
def list_skill_definitions_endpoint(include_disabled: bool = False) -> list[SkillDefinition]:
    return list_skill_definitions(include_disabled=include_disabled)


@router.post("/{skill_key}/disable", response_model=SkillDefinition)
def disable_skill_endpoint(skill_key: str) -> SkillDefinition:
    definition = get_skill_definition_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    disable_skill(skill_key)
    return get_skill_definition_registry(include_disabled=True)[skill_key]


@router.post("/{skill_key}/enable", response_model=SkillDefinition)
def enable_skill_endpoint(skill_key: str) -> SkillDefinition:
    definition = get_skill_definition_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    enable_skill(skill_key)
    return get_skill_definition_registry(include_disabled=True)[skill_key]


@router.delete("/{skill_key}")
def delete_skill_endpoint(skill_key: str) -> dict[str, str]:
    definition = get_skill_definition_registry(include_disabled=True).get(skill_key)
    if definition is None:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_key}' does not exist.")
    delete_skill(skill_key)
    return {"skillKey": skill_key, "status": "deleted"}

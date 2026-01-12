from __future__ import annotations

from fastapi import APIRouter

from app.core.schemas.skills import SkillDefinition
from app.skills.definitions import list_skill_definitions


router = APIRouter(prefix="/api/skills", tags=["skills"])


@router.get("/definitions", response_model=list[SkillDefinition])
def list_skill_definitions_endpoint() -> list[SkillDefinition]:
    return list_skill_definitions()

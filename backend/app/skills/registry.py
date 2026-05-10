from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

from app.core.schemas.skills import SkillCatalogStatus
from app.core.storage.skill_store import (
    OFFICIAL_SKILLS_DIR,
    USER_SKILLS_DIR,
    get_skill_status_map,
    list_managed_skill_keys,
)
from app.skills.runtime import (
    ScriptSkillRunner,
    build_lifecycle_after_llm_runner,
    build_script_skill_runner,
    has_lifecycle_after_llm,
    validate_script_runtime_spec,
)


SkillFunc = ScriptSkillRunner


def _build_runtime_skill_registry() -> dict[str, SkillFunc]:
    registry: dict[str, SkillFunc] = {}
    for skill_dir in _iter_skill_dirs([OFFICIAL_SKILLS_DIR, USER_SKILLS_DIR]):
        manifest = skill_dir / "skill.json"
        if not manifest.is_file():
            continue
        try:
            payload = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        skill_key = str(payload.get("skillKey") or payload.get("skill_key") or skill_dir.name).strip()
        runtime = payload.get("runtime") if isinstance(payload.get("runtime"), dict) else {}
        runtime_type = str(runtime.get("type") or "none")
        entrypoint = str(runtime.get("entrypoint") or "")
        command = [str(item) for item in runtime.get("command") or []]
        timeout_seconds = (
            runtime.get("timeoutSeconds")
            or runtime.get("timeout_seconds")
            or payload.get("timeoutSeconds")
            or payload.get("timeout_seconds")
        )
        if has_lifecycle_after_llm(skill_dir):
            if skill_key in registry:
                continue
            registry[skill_key] = build_lifecycle_after_llm_runner(
                skill_key=skill_key,
                skill_dir=skill_dir,
                timeout_seconds=timeout_seconds,
            )
            continue
        if validate_script_runtime_spec(
            skill_dir=skill_dir,
            runtime_type=runtime_type,
            entrypoint=entrypoint,
            command=command,
        ):
            continue
        if skill_key in registry:
            continue
        registry[skill_key] = build_script_skill_runner(
            skill_key=skill_key,
            skill_dir=skill_dir,
            runtime_type=runtime_type,
            entrypoint=entrypoint,
            command=command,
            timeout_seconds=timeout_seconds,
        )
    return registry


def _iter_skill_dirs(roots: Iterable[Path]) -> list[Path]:
    skill_dirs: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        skill_dirs.extend(
            sorted((path for path in root.iterdir() if path.is_dir()), key=lambda path: path.name.lower())
        )
    return skill_dirs


def list_runtime_skill_keys() -> set[str]:
    return set(_build_runtime_skill_registry().keys())


def get_skill_registry(*, include_disabled: bool = False) -> dict[str, SkillFunc]:
    registry = _build_runtime_skill_registry()
    if include_disabled:
        allowed_keys = list_managed_skill_keys()
        return {key: value for key, value in registry.items() if key in allowed_keys}
    status_map = get_skill_status_map()
    return {
        key: value
        for key, value in registry.items()
        if status_map.get(key, SkillCatalogStatus.ACTIVE) == SkillCatalogStatus.ACTIVE
    }

from __future__ import annotations

import shutil
from pathlib import Path

from app.core.schemas.skills import SkillCatalogStatus
from app.core.storage.database import SKILL_STATE_DATA_DIR
from app.core.storage.json_file_utils import read_json_file, write_json_file


ROOT_DIR = Path(__file__).resolve().parents[4]
GRAPHITE_SKILLS_DIR = ROOT_DIR / "skill"
SKILL_STATE_PATH = SKILL_STATE_DATA_DIR / "registry_states.json"


def graphite_managed_skill_path_for(skill_key: str) -> Path:
    return GRAPHITE_SKILLS_DIR / "claude_code" / skill_key / "SKILL.md"


def list_managed_skill_keys() -> set[str]:
    claude_root = GRAPHITE_SKILLS_DIR / "claude_code"
    if not claude_root.exists():
        return set()
    return {path.parent.name for path in claude_root.glob("*/SKILL.md")}


def get_skill_status_map() -> dict[str, SkillCatalogStatus]:
    SKILL_STATE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(SKILL_STATE_PATH, default={}) or {}
    return {
        str(skill_key): SkillCatalogStatus(str(status))
        for skill_key, status in payload.items()
    }


def set_skill_status(skill_key: str, status: SkillCatalogStatus) -> None:
    SKILL_STATE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(SKILL_STATE_PATH, default={}) or {}
    payload[skill_key] = status.value
    write_json_file(SKILL_STATE_PATH, payload)


def clear_skill_status(skill_key: str) -> None:
    SKILL_STATE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = read_json_file(SKILL_STATE_PATH, default={}) or {}
    if skill_key in payload:
        payload.pop(skill_key, None)
        write_json_file(SKILL_STATE_PATH, payload)


def delete_skill(skill_key: str) -> None:
    for root in [
        GRAPHITE_SKILLS_DIR / "claude_code" / skill_key,
        GRAPHITE_SKILLS_DIR / "openclaw" / skill_key,
        GRAPHITE_SKILLS_DIR / "codex" / skill_key,
        GRAPHITE_SKILLS_DIR / "graphite" / skill_key,
    ]:
        if root.is_file():
            root.unlink()
        elif root.is_dir():
            shutil.rmtree(root)
    clear_skill_status(skill_key)


def disable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.DISABLED)


def enable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.ACTIVE)


def import_skill_from_source(skill_key: str, source_path: str) -> Path:
    source = Path(source_path)
    destination = graphite_managed_skill_path_for(skill_key)
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_dir = source.parent if source.is_file() else source
    shutil.copytree(source_dir, destination.parent, dirs_exist_ok=True)
    enable_skill(skill_key)
    return destination

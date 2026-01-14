from __future__ import annotations

import shutil
from pathlib import Path

from app.core.schemas.skills import SkillCatalogStatus, SkillSourceFormat
from app.core.storage.database import get_connection


ROOT_DIR = Path(__file__).resolve().parents[4]
GRAPHITE_SKILLS_DIR = ROOT_DIR / ".graphite" / "skills"


def graphite_skill_path_for(skill_key: str, source_format: SkillSourceFormat) -> Path:
    if source_format == SkillSourceFormat.CLAUDE_CODE:
        return GRAPHITE_SKILLS_DIR / "claude_code" / skill_key / "SKILL.md"
    if source_format == SkillSourceFormat.OPENCLAW:
        return GRAPHITE_SKILLS_DIR / "openclaw" / skill_key / "SKILL.md"
    if source_format == SkillSourceFormat.CODEX:
        return GRAPHITE_SKILLS_DIR / "codex" / skill_key / "SKILL.md"
    return GRAPHITE_SKILLS_DIR / "graphite" / skill_key / "SKILL.md"


def list_managed_skill_keys() -> set[str]:
    keys: set[str] = set()
    claude_root = GRAPHITE_SKILLS_DIR / "claude_code"
    if claude_root.exists():
        keys.update(path.parent.name for path in claude_root.glob("*/SKILL.md"))
    for root in [GRAPHITE_SKILLS_DIR / "openclaw", GRAPHITE_SKILLS_DIR / "codex", GRAPHITE_SKILLS_DIR / "graphite"]:
        if not root.exists():
            continue
        keys.update(path.parent.name for path in root.glob("*/SKILL.md"))
    return keys


def get_skill_status_map() -> dict[str, SkillCatalogStatus]:
    with get_connection() as connection:
        rows = connection.execute("SELECT skill_key, status FROM skill_registry_states").fetchall()
    return {
        str(row["skill_key"]): SkillCatalogStatus(str(row["status"]))
        for row in rows
    }


def set_skill_status(skill_key: str, status: SkillCatalogStatus) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO skill_registry_states (skill_key, status, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(skill_key) DO UPDATE SET
                status = excluded.status,
                updated_at = CURRENT_TIMESTAMP
            """,
            (skill_key, status.value),
        )
        connection.commit()


def clear_skill_status(skill_key: str) -> None:
    with get_connection() as connection:
        connection.execute("DELETE FROM skill_registry_states WHERE skill_key = ?", (skill_key,))
        connection.commit()


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


def import_skill_from_source(skill_key: str, source_format: SkillSourceFormat, source_path: str) -> Path:
    source = Path(source_path)
    destination = graphite_skill_path_for(skill_key, source_format)
    destination.parent.mkdir(parents=True, exist_ok=True)
    source_dir = source.parent if source.is_file() else source
    shutil.copytree(source_dir, destination.parent, dirs_exist_ok=True)
    enable_skill(skill_key)
    return destination

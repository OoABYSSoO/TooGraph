from __future__ import annotations

from app.core.schemas.skills import SkillCatalogStatus
from app.core.storage.database import get_connection


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


def delete_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.DELETED)


def disable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.DISABLED)


def enable_skill(skill_key: str) -> None:
    set_skill_status(skill_key, SkillCatalogStatus.ACTIVE)

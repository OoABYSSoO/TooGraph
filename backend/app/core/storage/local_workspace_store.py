from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from pathlib import Path
from typing import Any

from app.core.storage import database
from app.core.storage.local_input_sources import SKIPPED_DIRECTORY_NAMES, is_denied_local_picker_path


CURRENT_WORKSPACE_KEY = "current_workspace_id"


def list_local_workspaces() -> dict[str, Any]:
    with database.get_connection() as connection:
        rows = connection.execute(
            """
            SELECT workspace_id, name, root_path, created_at, updated_at, last_opened_at
            FROM local_workspaces
            ORDER BY last_opened_at DESC, name ASC
            """
        ).fetchall()
        current_row = connection.execute(
            "SELECT value FROM local_workspace_state WHERE key = ?",
            (CURRENT_WORKSPACE_KEY,),
        ).fetchone()
    return {
        "workspaces": [_workspace_from_row(row) for row in rows],
        "current_workspace_id": str(current_row["value"] or "") if current_row else "",
    }


def get_local_workspace(workspace_id: str) -> dict[str, Any]:
    normalized_workspace_id = str(workspace_id or "").strip()
    if not normalized_workspace_id:
        raise ValueError("Workspace ID cannot be empty.")
    with database.get_connection() as connection:
        row = connection.execute(
            """
            SELECT workspace_id, name, root_path, created_at, updated_at, last_opened_at
            FROM local_workspaces
            WHERE workspace_id = ?
            """,
            (normalized_workspace_id,),
        ).fetchone()
    if not row:
        raise ValueError(f"Local workspace does not exist: {normalized_workspace_id}")
    return _workspace_from_row(row)


def create_or_open_local_workspace(root_path: str, name: str | None = None) -> dict[str, Any]:
    resolved_root = _resolve_workspace_root(root_path)
    workspace_id = _workspace_id_for_path(resolved_root)
    now = _now()
    display_name = (name or "").strip() or resolved_root.name or str(resolved_root)
    root_path_value = str(resolved_root)
    with database.get_connection() as connection:
        connection.execute(
            """
            INSERT INTO local_workspaces (
                workspace_id,
                name,
                root_path,
                created_at,
                updated_at,
                last_opened_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(root_path) DO UPDATE SET
                name = excluded.name,
                updated_at = excluded.updated_at,
                last_opened_at = excluded.last_opened_at
            """,
            (workspace_id, display_name, root_path_value, now, now, now),
        )
        connection.execute(
            """
            INSERT INTO local_workspace_state (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (CURRENT_WORKSPACE_KEY, workspace_id, now),
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT workspace_id, name, root_path, created_at, updated_at, last_opened_at
            FROM local_workspaces
            WHERE workspace_id = ?
            """,
            (workspace_id,),
        ).fetchone()
    if not row:
        raise ValueError("Failed to create local workspace.")
    return _workspace_from_row(row)


def set_current_local_workspace(workspace_id: str) -> dict[str, Any]:
    workspace = get_local_workspace(workspace_id)
    now = _now()
    with database.get_connection() as connection:
        connection.execute(
            "UPDATE local_workspaces SET last_opened_at = ?, updated_at = ? WHERE workspace_id = ?",
            (now, now, workspace["workspace_id"]),
        )
        connection.execute(
            """
            INSERT INTO local_workspace_state (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
            """,
            (CURRENT_WORKSPACE_KEY, workspace["workspace_id"], now),
        )
        connection.commit()
    return get_local_workspace(workspace["workspace_id"])


def _workspace_from_row(row: Any) -> dict[str, str]:
    return {
        "workspace_id": str(row["workspace_id"] or ""),
        "name": str(row["name"] or ""),
        "root_path": str(row["root_path"] or ""),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
        "last_opened_at": str(row["last_opened_at"] or ""),
    }


def _resolve_workspace_root(root_path: str) -> Path:
    raw_path = str(root_path or "").strip()
    if not raw_path:
        raise ValueError("Workspace folder path cannot be empty.")
    resolved = Path(raw_path).expanduser().resolve()
    if not resolved.is_dir():
        raise ValueError(f"Workspace folder does not exist: {root_path}")
    if resolved.name in SKIPPED_DIRECTORY_NAMES or is_denied_local_picker_path(resolved):
        raise ValueError("Workspace folder is denied by the local read policy.")
    return resolved


def _workspace_id_for_path(root_path: Path) -> str:
    digest = hashlib.sha256(str(root_path).encode("utf-8")).hexdigest()[:16]
    return f"local_workspace_{digest}"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

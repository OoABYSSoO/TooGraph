from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
import json
from pathlib import Path
from typing import Any, Iterator
from uuid import uuid4

from app.buddy.home import (
    DEFAULT_POLICY,
    DEFAULT_PROFILE,
    DEFAULT_SESSION_SUMMARY,
    MEMORY_PATH,
    POLICY_PATH,
    SOUL_PATH,
    ensure_buddy_home,
    get_default_buddy_home_dir,
    open_buddy_database,
    read_profile_markdown,
    render_memory_markdown,
    render_profile_markdown,
)
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


BUDDY_HOME_DIR = get_default_buddy_home_dir()


def initialize_buddy_home() -> None:
    ensure_buddy_home(BUDDY_HOME_DIR)


def buddy_home_path(file_name: str) -> Path:
    initialize_buddy_home()
    return BUDDY_HOME_DIR / file_name


def load_profile() -> dict[str, Any]:
    initialize_buddy_home()
    return read_profile_markdown(BUDDY_HOME_DIR / SOUL_PATH)


def save_profile(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_profile()
    cleaned = _clean_dict(payload)
    next_value = {
        **previous,
        **cleaned,
        "display_preferences": _merged_display_preferences(previous, cleaned),
    }
    _write_with_revision("profile", "profile", "update", previous, next_value, changed_by, change_reason)
    (BUDDY_HOME_DIR / SOUL_PATH).write_text(render_profile_markdown(next_value), encoding="utf-8")
    return load_profile()


def load_policy() -> dict[str, Any]:
    return _read_dict(POLICY_PATH, DEFAULT_POLICY)


def save_policy(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_policy()
    next_value = {**previous, **_clean_dict(payload), "graph_permission_mode": "advisory"}
    _write_with_revision("policy", "policy", "update", previous, next_value, changed_by, change_reason)
    _write_json(POLICY_PATH, next_value)
    return load_policy()


def list_memories(*, include_deleted: bool = False) -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT id, type, title, content, source_json, confidence, enabled, deleted, created_at, updated_at
            FROM buddy_memories
            ORDER BY created_at ASC
            """
        ).fetchall()
    memories = [_memory_from_row(row) for row in rows]
    if include_deleted:
        return memories
    return [memory for memory in memories if memory.get("enabled", True) and not memory.get("deleted", False)]


def create_memory(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    now = utc_now_iso()
    source = payload.get("source") if isinstance(payload.get("source"), dict) else {"kind": "manual", "message_ids": []}
    memory = {
        "id": f"mem_{uuid4().hex[:12]}",
        "type": str(payload.get("type") or "fact").strip() or "fact",
        "title": str(payload.get("title") or "Untitled memory").strip() or "Untitled memory",
        "content": str(payload.get("content") or "").strip(),
        "source": source,
        "confidence": float(payload.get("confidence") or 1),
        "enabled": bool(payload.get("enabled", True)),
        "deleted": bool(payload.get("deleted", False)),
        "created_at": now,
        "updated_at": now,
    }
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_memories
                (id, type, title, content, source_json, confidence, enabled, deleted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                memory["id"],
                memory["type"],
                memory["title"],
                memory["content"],
                _json_dumps(memory["source"]),
                memory["confidence"],
                int(memory["enabled"]),
                int(memory["deleted"]),
                memory["created_at"],
                memory["updated_at"],
            ),
        )
        connection.commit()
    _write_with_revision("memory", memory["id"], "create", {}, memory, changed_by, change_reason)
    _sync_memory_markdown()
    return memory


def update_memory(memory_id: str, payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = _get_memory(memory_id)
    cleaned = _clean_dict(payload)
    next_value = {
        **previous,
        **cleaned,
        "source": cleaned.get("source") if isinstance(cleaned.get("source"), dict) else previous.get("source", {}),
        "confidence": float(cleaned.get("confidence", previous.get("confidence", 1)) or 1),
        "enabled": bool(cleaned.get("enabled", previous.get("enabled", True))),
        "deleted": bool(cleaned.get("deleted", previous.get("deleted", False))),
        "updated_at": utc_now_iso(),
    }
    with _connection() as connection:
        connection.execute(
            """
            UPDATE buddy_memories
            SET type = ?, title = ?, content = ?, source_json = ?, confidence = ?,
                enabled = ?, deleted = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                str(next_value.get("type") or "fact"),
                str(next_value.get("title") or "Untitled memory"),
                str(next_value.get("content") or ""),
                _json_dumps(next_value.get("source") if isinstance(next_value.get("source"), dict) else {}),
                float(next_value.get("confidence") or 1),
                int(bool(next_value.get("enabled", True))),
                int(bool(next_value.get("deleted", False))),
                str(next_value["updated_at"]),
                memory_id,
            ),
        )
        connection.commit()
    next_value = _get_memory(memory_id)
    _write_with_revision("memory", memory_id, "update", previous, next_value, changed_by, change_reason)
    _sync_memory_markdown()
    return next_value


def delete_memory(memory_id: str, *, changed_by: str, change_reason: str) -> dict[str, Any]:
    return update_memory(memory_id, {"enabled": False, "deleted": True}, changed_by=changed_by, change_reason=change_reason)


def load_session_summary() -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute("SELECT value_json FROM buddy_kv WHERE key = ?", ("session_summary",)).fetchone()
    if not row:
        return {**deepcopy(DEFAULT_SESSION_SUMMARY), "updated_at": utc_now_iso()}
    try:
        value = json.loads(str(row["value_json"] or "{}"))
    except Exception:
        value = {}
    if not isinstance(value, dict):
        value = {}
    return {**deepcopy(DEFAULT_SESSION_SUMMARY), **value, "updated_at": value.get("updated_at") or utc_now_iso()}


def save_session_summary(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_session_summary()
    next_value = {**previous, "content": str(payload.get("content") or "").strip(), "updated_at": utc_now_iso()}
    _write_with_revision("session_summary", "session_summary", "update", previous, next_value, changed_by, change_reason)
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_kv (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
            """,
            ("session_summary", _json_dumps(next_value), next_value["updated_at"]),
        )
        connection.commit()
    return load_session_summary()


def list_revisions(target_type: str | None = None, target_id: str | None = None) -> list[dict[str, Any]]:
    query = """
        SELECT revision_id, target_type, target_id, operation, previous_value_json, next_value_json,
               changed_by, change_reason, created_at
        FROM buddy_revisions
    """
    conditions: list[str] = []
    params: list[str] = []
    if target_type:
        conditions.append("target_type = ?")
        params.append(target_type)
    if target_id:
        conditions.append("target_id = ?")
        params.append(target_id)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY created_at ASC"
    with _connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [_revision_from_row(row) for row in rows]


def restore_revision(revision_id: str, *, changed_by: str, change_reason: str) -> dict[str, Any]:
    revision = next((item for item in list_revisions() if item.get("revision_id") == revision_id), None)
    if not revision:
        raise KeyError(revision_id)
    target_type = str(revision["target_type"])
    target_id = str(revision["target_id"])
    restored = deepcopy(revision.get("previous_value") or {})
    if target_type == "profile":
        current = load_profile()
        _write_with_revision("profile", "profile", "restore", current, restored, changed_by, change_reason)
        (BUDDY_HOME_DIR / SOUL_PATH).write_text(render_profile_markdown(restored), encoding="utf-8")
    elif target_type == "policy":
        current = load_policy()
        restored["graph_permission_mode"] = "advisory"
        _write_with_revision("policy", "policy", "restore", current, restored, changed_by, change_reason)
        _write_json(POLICY_PATH, restored)
    elif target_type == "memory":
        current = _get_memory(target_id)
        restored = {**restored, "updated_at": utc_now_iso(), "deleted": False, "enabled": True}
        _replace_memory(target_id, restored)
        _write_with_revision("memory", target_id, "restore", current, _get_memory(target_id), changed_by, change_reason)
        _sync_memory_markdown()
    elif target_type == "session_summary":
        current = load_session_summary()
        _write_with_revision("session_summary", "session_summary", "restore", current, restored, changed_by, change_reason)
        with _connection() as connection:
            connection.execute(
                """
                INSERT INTO buddy_kv (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
                """,
                ("session_summary", _json_dumps(restored), utc_now_iso()),
            )
            connection.commit()
    else:
        raise ValueError(f"Unsupported revision target type: {target_type}")
    return {"target_type": target_type, "target_id": target_id, "current_value": restored}


def list_command_records() -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT command_id, kind, action, status, target_type, target_id, revision_id,
                   run_id, payload_json, change_reason, created_at, completed_at
            FROM buddy_commands
            ORDER BY created_at ASC
            """
        ).fetchall()
    return [_command_from_row(row) for row in rows]


def append_command_record(command: dict[str, Any]) -> None:
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_commands
                (command_id, kind, action, status, target_type, target_id, revision_id,
                 run_id, payload_json, change_reason, created_at, completed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(command.get("command_id") or ""),
                str(command.get("kind") or ""),
                str(command.get("action") or ""),
                str(command.get("status") or ""),
                str(command.get("target_type") or ""),
                str(command.get("target_id") or ""),
                command.get("revision_id"),
                command.get("run_id"),
                _json_dumps(command.get("payload") if isinstance(command.get("payload"), dict) else {}),
                str(command.get("change_reason") or ""),
                str(command.get("created_at") or ""),
                command.get("completed_at"),
            ),
        )
        connection.commit()


def _write_with_revision(
    target_type: str,
    target_id: str,
    operation: str,
    previous_value: dict[str, Any],
    next_value: dict[str, Any],
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    revision = {
        "revision_id": f"rev_{uuid4().hex[:12]}",
        "target_type": target_type,
        "target_id": target_id,
        "operation": operation,
        "previous_value": deepcopy(previous_value),
        "next_value": deepcopy(next_value),
        "changed_by": changed_by,
        "change_reason": change_reason,
        "created_at": utc_now_iso(),
    }
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_revisions
                (revision_id, target_type, target_id, operation, previous_value_json,
                 next_value_json, changed_by, change_reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                revision["revision_id"],
                revision["target_type"],
                revision["target_id"],
                revision["operation"],
                _json_dumps(revision["previous_value"]),
                _json_dumps(revision["next_value"]),
                revision["changed_by"],
                revision["change_reason"],
                revision["created_at"],
            ),
        )
        connection.commit()
    return revision


def _get_memory(memory_id: str) -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT id, type, title, content, source_json, confidence, enabled, deleted, created_at, updated_at
            FROM buddy_memories
            WHERE id = ?
            """,
            (memory_id,),
        ).fetchone()
    if not row:
        raise KeyError(memory_id)
    return _memory_from_row(row)


def _replace_memory(memory_id: str, payload: dict[str, Any]) -> None:
    with _connection() as connection:
        connection.execute(
            """
            UPDATE buddy_memories
            SET type = ?, title = ?, content = ?, source_json = ?, confidence = ?,
                enabled = ?, deleted = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                str(payload.get("type") or "fact"),
                str(payload.get("title") or "Untitled memory"),
                str(payload.get("content") or ""),
                _json_dumps(payload.get("source") if isinstance(payload.get("source"), dict) else {}),
                float(payload.get("confidence") or 1),
                int(bool(payload.get("enabled", True))),
                int(bool(payload.get("deleted", False))),
                str(payload.get("updated_at") or utc_now_iso()),
                memory_id,
            ),
        )
        connection.commit()


def _sync_memory_markdown() -> None:
    memories = list_memories(include_deleted=True)
    (BUDDY_HOME_DIR / MEMORY_PATH).write_text(render_memory_markdown(memories), encoding="utf-8")


def _read_dict(file_name: str, default: dict[str, Any]) -> dict[str, Any]:
    value = read_json_file(buddy_home_path(file_name), default=deepcopy(default))
    return value if isinstance(value, dict) else deepcopy(default)


def _write_json(file_name: str, payload: Any) -> None:
    write_json_file(buddy_home_path(file_name), payload)


@contextmanager
def _connection() -> Iterator[Any]:
    connection = open_buddy_database(BUDDY_HOME_DIR)
    try:
        yield connection
    finally:
        connection.close()


def _memory_from_row(row: Any) -> dict[str, Any]:
    try:
        source = json.loads(str(row["source_json"] or "{}"))
    except Exception:
        source = {}
    return {
        "id": str(row["id"] or ""),
        "type": str(row["type"] or "fact"),
        "title": str(row["title"] or "Untitled memory"),
        "content": str(row["content"] or ""),
        "source": source if isinstance(source, dict) else {},
        "confidence": float(row["confidence"] or 1),
        "enabled": bool(row["enabled"]),
        "deleted": bool(row["deleted"]),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _revision_from_row(row: Any) -> dict[str, Any]:
    return {
        "revision_id": str(row["revision_id"] or ""),
        "target_type": str(row["target_type"] or ""),
        "target_id": str(row["target_id"] or ""),
        "operation": str(row["operation"] or ""),
        "previous_value": _json_loads_object(row["previous_value_json"]),
        "next_value": _json_loads_object(row["next_value_json"]),
        "changed_by": str(row["changed_by"] or ""),
        "change_reason": str(row["change_reason"] or ""),
        "created_at": str(row["created_at"] or ""),
    }


def _command_from_row(row: Any) -> dict[str, Any]:
    return {
        "command_id": str(row["command_id"] or ""),
        "kind": str(row["kind"] or ""),
        "action": str(row["action"] or ""),
        "status": str(row["status"] or ""),
        "target_type": str(row["target_type"] or ""),
        "target_id": str(row["target_id"] or ""),
        "revision_id": row["revision_id"],
        "run_id": row["run_id"],
        "payload": _json_loads_object(row["payload_json"]),
        "change_reason": str(row["change_reason"] or ""),
        "created_at": str(row["created_at"] or ""),
        "completed_at": row["completed_at"],
    }


def _json_loads_object(value: Any) -> dict[str, Any]:
    try:
        parsed = json.loads(str(value or "{}"))
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _json_dumps(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _merged_display_preferences(previous: dict[str, Any], cleaned: dict[str, Any]) -> dict[str, Any]:
    previous_preferences = previous.get("display_preferences")
    cleaned_preferences = cleaned.get("display_preferences")
    merged = deepcopy(previous_preferences) if isinstance(previous_preferences, dict) else {}
    if isinstance(cleaned_preferences, dict):
        merged.update(cleaned_preferences)
    return merged


def _clean_dict(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}

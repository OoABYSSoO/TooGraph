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
DEFAULT_CHAT_SESSION_TITLE = "新的对话"
MAX_CHAT_SESSION_TITLE_CHARS = 32
MAX_CHAT_MESSAGE_PREVIEW_CHARS = 96
RUN_TEMPLATE_BINDING_KEY = "run_template_binding"
RUN_TEMPLATE_BINDING_TARGET_TYPE = "run_template_binding"
RUN_TEMPLATE_BINDING_TARGET_ID = "run_template_binding"
RUN_TEMPLATE_BINDING_VERSION = 1
ALLOWED_RUN_TEMPLATE_INPUT_SOURCES = {
    "current_message",
    "conversation_history",
    "page_context",
    "buddy_home_context",
}
DEFAULT_RUN_TEMPLATE_BINDING = {
    "version": RUN_TEMPLATE_BINDING_VERSION,
    "template_id": "buddy_autonomous_loop",
    "input_bindings": {
        "input_user_message": "current_message",
        "input_conversation_history": "conversation_history",
        "input_page_context": "page_context",
        "input_buddy_context": "buddy_home_context",
    },
}


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
    return _normalize_policy(_read_dict(POLICY_PATH, DEFAULT_POLICY))


def save_policy(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_policy()
    next_value = _normalize_policy({**previous, **_clean_dict(payload)})
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


def load_run_template_binding() -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute("SELECT value_json FROM buddy_kv WHERE key = ?", (RUN_TEMPLATE_BINDING_KEY,)).fetchone()
    if not row:
        return _normalize_run_template_binding(DEFAULT_RUN_TEMPLATE_BINDING)
    try:
        value = json.loads(str(row["value_json"] or "{}"))
    except Exception:
        value = {}
    if not isinstance(value, dict):
        value = {}
    return _normalize_run_template_binding(value)


def save_run_template_binding(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_run_template_binding()
    next_value = _normalize_run_template_binding(payload)
    _write_with_revision(
        RUN_TEMPLATE_BINDING_TARGET_TYPE,
        RUN_TEMPLATE_BINDING_TARGET_ID,
        "update",
        previous,
        next_value,
        changed_by,
        change_reason,
    )
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_kv (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
            """,
            (RUN_TEMPLATE_BINDING_KEY, _json_dumps(next_value), next_value["updated_at"]),
        )
        connection.commit()
    return load_run_template_binding()


def list_chat_sessions(*, include_deleted: bool = False) -> list[dict[str, Any]]:
    query = """
        SELECT session_id, title, archived, deleted, created_at, updated_at
        FROM buddy_sessions
    """
    params: list[Any] = []
    if not include_deleted:
        query += " WHERE deleted = 0"
    query += " ORDER BY updated_at DESC, created_at DESC"
    with _connection() as connection:
        rows = connection.execute(query, params).fetchall()
        sessions = [_chat_session_from_row(row) for row in rows]
        for session in sessions:
            session.update(_chat_session_stats(connection, str(session["session_id"])))
    return sessions


def create_chat_session(
    payload: dict[str, Any] | None = None,
    *,
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    del changed_by, change_reason
    now = utc_now_iso()
    title = _normalize_chat_session_title((payload or {}).get("title"))
    session = {
        "session_id": f"session_{uuid4().hex[:12]}",
        "title": title or DEFAULT_CHAT_SESSION_TITLE,
        "archived": False,
        "deleted": False,
        "created_at": now,
        "updated_at": now,
    }
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_sessions (session_id, title, archived, deleted, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                session["session_id"],
                session["title"],
                int(session["archived"]),
                int(session["deleted"]),
                session["created_at"],
                session["updated_at"],
            ),
        )
        connection.commit()
    return get_chat_session(str(session["session_id"]))


def get_chat_session(session_id: str, *, include_deleted: bool = False) -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT session_id, title, archived, deleted, created_at, updated_at
            FROM buddy_sessions
            WHERE session_id = ?
            """,
            (session_id,),
        ).fetchone()
        if not row:
            raise KeyError(session_id)
        session = _chat_session_from_row(row)
        if session["deleted"] and not include_deleted:
            raise KeyError(session_id)
        session.update(_chat_session_stats(connection, session_id))
    return session


def update_chat_session(
    session_id: str,
    payload: dict[str, Any],
    *,
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    del changed_by, change_reason
    previous = get_chat_session(session_id, include_deleted=True)
    next_title = previous["title"]
    if "title" in payload:
        next_title = _normalize_chat_session_title(payload.get("title")) or DEFAULT_CHAT_SESSION_TITLE
    next_archived = bool(payload.get("archived", previous.get("archived", False)))
    now = utc_now_iso()
    with _connection() as connection:
        connection.execute(
            """
            UPDATE buddy_sessions
            SET title = ?, archived = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (next_title, int(next_archived), now, session_id),
        )
        connection.commit()
    return get_chat_session(session_id, include_deleted=bool(previous.get("deleted")))


def delete_chat_session(session_id: str, *, changed_by: str, change_reason: str) -> dict[str, Any]:
    del changed_by, change_reason
    previous = get_chat_session(session_id, include_deleted=True)
    now = utc_now_iso()
    with _connection() as connection:
        connection.execute(
            """
            UPDATE buddy_sessions
            SET deleted = 1, archived = 1, updated_at = ?
            WHERE session_id = ?
            """,
            (now, session_id),
        )
        connection.commit()
    return get_chat_session(session_id, include_deleted=bool(previous))


def list_chat_messages(session_id: str, *, limit: int | None = None) -> list[dict[str, Any]]:
    get_chat_session(session_id)
    query = """
        SELECT message_id, session_id, role, content, client_order, include_in_context, run_id, metadata_json, created_at, updated_at
        FROM buddy_messages
        WHERE session_id = ?
        ORDER BY client_order IS NULL ASC, client_order ASC, created_at ASC, rowid ASC
    """
    params: list[Any] = [session_id]
    if limit is not None:
        query += " LIMIT ?"
        params.append(max(1, int(limit)))
    with _connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [_chat_message_from_row(row) for row in rows]


def append_chat_message(
    session_id: str,
    payload: dict[str, Any],
    *,
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    del changed_by, change_reason
    session = get_chat_session(session_id)
    role = str(payload.get("role") or "").strip()
    if role not in {"user", "assistant"}:
        raise ValueError("Message role must be user or assistant.")
    content = str(payload.get("content") or "")
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    if not content.strip() and metadata.get("kind") != "output_trace":
        raise ValueError("Message content cannot be empty.")
    now = utc_now_iso()
    client_order = _coerce_chat_message_client_order(payload.get("client_order"))
    message = {
        "message_id": str(payload.get("message_id") or f"msg_{uuid4().hex[:12]}"),
        "session_id": session_id,
        "role": role,
        "content": content,
        "client_order": client_order,
        "include_in_context": bool(payload.get("include_in_context", True)),
        "run_id": payload.get("run_id") if payload.get("run_id") is None else str(payload.get("run_id")),
        "metadata": metadata,
        "created_at": now,
        "updated_at": now,
    }
    with _connection() as connection:
        if message["client_order"] is None:
            message["client_order"] = _next_chat_message_client_order(connection, session_id)
        connection.execute(
            """
            INSERT INTO buddy_messages
                (message_id, session_id, role, content, client_order, include_in_context, run_id, metadata_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message["message_id"],
                message["session_id"],
                message["role"],
                message["content"],
                message["client_order"],
                int(message["include_in_context"]),
                message["run_id"],
                _json_dumps(message["metadata"]),
                message["created_at"],
                message["updated_at"],
            ),
        )
        next_title = str(session.get("title") or DEFAULT_CHAT_SESSION_TITLE)
        if role == "user" and next_title == DEFAULT_CHAT_SESSION_TITLE:
            next_title = _derive_chat_session_title(content)
        connection.execute(
            """
            UPDATE buddy_sessions
            SET title = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (next_title, now, session_id),
        )
        connection.commit()
    return _get_chat_message(str(message["message_id"]))


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
        restored = _normalize_policy(restored)
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
    elif target_type == RUN_TEMPLATE_BINDING_TARGET_TYPE:
        current = load_run_template_binding()
        restored = _normalize_run_template_binding(restored)
        _write_with_revision(
            RUN_TEMPLATE_BINDING_TARGET_TYPE,
            RUN_TEMPLATE_BINDING_TARGET_ID,
            "restore",
            current,
            restored,
            changed_by,
            change_reason,
        )
        with _connection() as connection:
            connection.execute(
                """
                INSERT INTO buddy_kv (key, value_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
                """,
                (RUN_TEMPLATE_BINDING_KEY, _json_dumps(restored), utc_now_iso()),
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


def _normalize_policy(payload: dict[str, Any]) -> dict[str, Any]:
    mode = payload.get("graph_permission_mode")
    if mode == "full_access" or mode == "unrestricted":
        graph_permission_mode = "full_access"
    else:
        graph_permission_mode = "ask_first"
    return {**deepcopy(DEFAULT_POLICY), **payload, "graph_permission_mode": graph_permission_mode}


def _normalize_run_template_binding(payload: dict[str, Any]) -> dict[str, Any]:
    template_id = str(payload.get("template_id") or "").strip()
    if not template_id:
        raise ValueError("template_id is required.")
    raw_bindings = payload.get("input_bindings")
    if not isinstance(raw_bindings, dict):
        raise ValueError("input_bindings must be an object.")
    input_bindings: dict[str, str] = {}
    for node_id, source in raw_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        normalized_source = str(source or "").strip()
        if not normalized_node_id or not normalized_source:
            continue
        if normalized_source not in ALLOWED_RUN_TEMPLATE_INPUT_SOURCES:
            raise ValueError(f"Unsupported Buddy input source: {normalized_source}")
        input_bindings[normalized_node_id] = normalized_source
    current_message_count = sum(1 for source in input_bindings.values() if source == "current_message")
    if current_message_count != 1:
        raise ValueError("current_message must be bound exactly once.")
    return {
        "version": RUN_TEMPLATE_BINDING_VERSION,
        "template_id": template_id,
        "input_bindings": input_bindings,
        "updated_at": str(payload.get("updated_at") or utc_now_iso()),
    }


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


def _get_chat_message(message_id: str) -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT message_id, session_id, role, content, client_order, include_in_context, run_id, metadata_json, created_at, updated_at
            FROM buddy_messages
            WHERE message_id = ?
            """,
            (message_id,),
        ).fetchone()
    if not row:
        raise KeyError(message_id)
    return _chat_message_from_row(row)


def _chat_session_from_row(row: Any) -> dict[str, Any]:
    return {
        "session_id": str(row["session_id"] or ""),
        "title": str(row["title"] or DEFAULT_CHAT_SESSION_TITLE),
        "archived": bool(row["archived"]),
        "deleted": bool(row["deleted"]),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _chat_session_stats(connection: Any, session_id: str) -> dict[str, Any]:
    count_row = connection.execute(
        "SELECT COUNT(*) AS message_count FROM buddy_messages WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    last_row = connection.execute(
        """
        SELECT content, created_at
        FROM buddy_messages
        WHERE session_id = ?
        ORDER BY client_order IS NULL ASC, client_order DESC, created_at DESC, rowid DESC
        LIMIT 1
        """,
        (session_id,),
    ).fetchone()
    last_preview = ""
    last_message_at = None
    if last_row:
        last_preview = _truncate_chat_message_preview(str(last_row["content"] or ""))
        last_message_at = str(last_row["created_at"] or "")
    return {
        "message_count": int(count_row["message_count"] if count_row else 0),
        "last_message_preview": last_preview,
        "last_message_at": last_message_at,
    }


def _chat_message_from_row(row: Any) -> dict[str, Any]:
    return {
        "message_id": str(row["message_id"] or ""),
        "session_id": str(row["session_id"] or ""),
        "role": str(row["role"] or ""),
        "content": str(row["content"] or ""),
        "client_order": row["client_order"],
        "include_in_context": bool(row["include_in_context"]),
        "run_id": row["run_id"],
        "metadata": _json_loads_object(row["metadata_json"]),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _coerce_chat_message_client_order(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _next_chat_message_client_order(connection: Any, session_id: str) -> float:
    row = connection.execute(
        "SELECT MAX(client_order) AS max_order FROM buddy_messages WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    if not row or row["max_order"] is None:
        return 0.0
    return float(row["max_order"]) + 1.0


def _derive_chat_session_title(content: str) -> str:
    normalized = " ".join(content.strip().split())
    if not normalized:
        return DEFAULT_CHAT_SESSION_TITLE
    return _truncate_chat_session_title(normalized)


def _normalize_chat_session_title(value: Any) -> str:
    return _truncate_chat_session_title(" ".join(str(value or "").strip().split()))


def _truncate_chat_session_title(value: str) -> str:
    if len(value) <= MAX_CHAT_SESSION_TITLE_CHARS:
        return value
    return f"{value[: MAX_CHAT_SESSION_TITLE_CHARS - 1]}…"


def _truncate_chat_message_preview(value: str) -> str:
    normalized = " ".join(value.strip().split())
    if len(normalized) <= MAX_CHAT_MESSAGE_PREVIEW_CHARS:
        return normalized
    return f"{normalized[: MAX_CHAT_MESSAGE_PREVIEW_CHARS - 1]}…"


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

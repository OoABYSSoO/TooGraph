from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path
import re
from typing import Any, Iterator
from uuid import uuid4

from app.buddy.home import (
    AGENTS_PATH,
    BUDDY_DB_PATH,
    CAPABILITY_USAGE_STATS_KEY,
    DEFAULT_CAPABILITY_USAGE_STATS,
    DEFAULT_POLICY,
    DEFAULT_PROFILE,
    DEFAULT_SESSION_SUMMARY,
    MEMORY_PATH,
    POLICY_PATH,
    SOUL_PATH,
    USER_PATH,
    ensure_buddy_home,
    get_default_buddy_home_dir,
    open_buddy_database,
    read_profile_markdown,
    render_profile_markdown,
)
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


BUDDY_HOME_DIR = get_default_buddy_home_dir()
DEFAULT_CHAT_SESSION_TITLE = "新的对话"
MAX_CHAT_SESSION_TITLE_CHARS = 32
MAX_CHAT_MESSAGE_PREVIEW_CHARS = 96
DEFAULT_RECALL_BOOKEND = 3
DEFAULT_RECALL_WINDOW = 5
MAX_RECALL_LIMIT = 50
MAX_RECALL_WINDOW = 20
MAX_BUDDY_HOME_FILE_CONTENT_CHARS = 200_000
HIDDEN_SESSION_SOURCES = {"tool"}
DEPRECATED_BUDDY_INPUT_SOURCES = {"page_context", "raw_conversation_history"}
RUN_TEMPLATE_BINDING_KEY = "run_template_binding"
RUN_TEMPLATE_BINDING_TARGET_TYPE = "run_template_binding"
RUN_TEMPLATE_BINDING_TARGET_ID = "run_template_binding"
RUN_TEMPLATE_BINDING_VERSION = 1
MEMORY_REVIEW_TEMPLATE_BINDING_KEY = "memory_review_template_binding"
MEMORY_REVIEW_TEMPLATE_BINDING_TARGET_TYPE = "memory_review_template_binding"
MEMORY_REVIEW_TEMPLATE_BINDING_TARGET_ID = "memory_review_template_binding"
MEMORY_REVIEW_TEMPLATE_BINDING_VERSION = 1
CAPABILITY_USAGE_STATS_TARGET_TYPE = "capability_usage_stats"
CAPABILITY_USAGE_STATS_TARGET_ID = "capability_usage_stats"
MAX_CAPABILITY_USAGE_RECENT_RUNS = 5
ALLOWED_RUN_TEMPLATE_INPUT_SOURCES = {
    "current_message",
    "conversation_history",
    "session_summary",
    "buddy_home_context",
    "current_session_id",
}
ALLOWED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES = {
    "source_run_id",
    "current_session_id",
    "user_message",
    "conversation_history",
    "buddy_home_context",
    "request_understanding",
    "capability_result",
    "capability_review",
    "public_response",
}
REQUIRED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES = {
    "source_run_id",
    "current_session_id",
    "user_message",
    "public_response",
    "buddy_home_context",
}
DEFAULT_RUN_TEMPLATE_BINDING = {
    "version": RUN_TEMPLATE_BINDING_VERSION,
    "template_id": "buddy_autonomous_loop",
    "input_bindings": {
        "input_user_message": "current_message",
        "input_conversation_history": "conversation_history",
        "input_existing_session_summary": "session_summary",
        "input_buddy_context": "buddy_home_context",
        "input_current_session_id": "current_session_id",
    },
}
DEFAULT_MEMORY_REVIEW_TEMPLATE_BINDING = {
    "version": MEMORY_REVIEW_TEMPLATE_BINDING_VERSION,
    "template_id": "buddy_autonomous_review",
    "input_bindings": {
        "input_source_run_id": "source_run_id",
        "input_current_session_id": "current_session_id",
        "input_user_message": "user_message",
        "input_conversation_history": "conversation_history",
        "input_buddy_context": "buddy_home_context",
        "input_request_understanding": "request_understanding",
        "input_capability_result": "capability_result",
        "input_capability_review": "capability_review",
        "input_public_response": "public_response",
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


def load_memory_document() -> dict[str, Any]:
    initialize_buddy_home()
    path = BUDDY_HOME_DIR / MEMORY_PATH
    return {
        "path": MEMORY_PATH,
        "content": path.read_text(encoding="utf-8"),
        "updated_at": "",
    }


def save_memory_document(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_memory_document()
    content = str(payload.get("content") or "")
    if not content.strip():
        raise ValueError("MEMORY.md content cannot be empty.")
    next_value = {
        "path": MEMORY_PATH,
        "content": content,
        "updated_at": utc_now_iso(),
    }
    _write_with_revision("home_file", MEMORY_PATH, "update", previous, next_value, changed_by, change_reason)
    (BUDDY_HOME_DIR / MEMORY_PATH).write_text(content, encoding="utf-8")
    return load_memory_document()


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


def list_home_files() -> dict[str, Any]:
    initialize_buddy_home()
    files = [
        _home_file_entry(BUDDY_HOME_DIR / AGENTS_PATH, AGENTS_PATH),
        _home_file_entry(BUDDY_HOME_DIR / SOUL_PATH, SOUL_PATH),
        _home_file_entry(BUDDY_HOME_DIR / USER_PATH, USER_PATH),
        _home_file_entry(BUDDY_HOME_DIR / MEMORY_PATH, MEMORY_PATH),
        _home_file_entry(BUDDY_HOME_DIR / POLICY_PATH, POLICY_PATH),
        _home_file_entry(
            BUDDY_HOME_DIR / BUDDY_DB_PATH,
            BUDDY_DB_PATH,
            kind="database",
            readable=False,
            summary="SQLite database backing Buddy chat sessions, messages, command audit records, revisions, and recall indexes.",
        ),
    ]
    return {"root": str(BUDDY_HOME_DIR), "files": files}


def load_capability_usage_stats() -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute(
            "SELECT value_json FROM buddy_kv WHERE key = ?",
            (CAPABILITY_USAGE_STATS_KEY,),
        ).fetchone()
    if not row:
        return _normalize_capability_usage_stats(deepcopy(DEFAULT_CAPABILITY_USAGE_STATS))
    try:
        value = json.loads(str(row["value_json"] or "{}"))
    except Exception:
        value = {}
    return _normalize_capability_usage_stats(value if isinstance(value, dict) else {})


def update_capability_usage_stats(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_capability_usage_stats()
    next_value = deepcopy(previous)
    now = utc_now_iso()
    for entry in _coerce_capability_usage_entries(payload):
        _apply_capability_usage_entry(next_value, entry, now=now)
    next_value["updated_at"] = now
    _write_with_revision(
        CAPABILITY_USAGE_STATS_TARGET_TYPE,
        CAPABILITY_USAGE_STATS_TARGET_ID,
        "update",
        previous,
        next_value,
        changed_by,
        change_reason,
    )
    _write_kv(CAPABILITY_USAGE_STATS_KEY, next_value, now)
    return load_capability_usage_stats()


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
    try:
        binding = _normalize_run_template_binding(value)
        if _run_template_binding_needs_repair(value, binding):
            return _with_run_template_binding_repair_metadata(
                binding,
                reason="normalized_saved_binding",
                previous_value=value,
            )
        return binding
    except Exception as exc:
        binding = _normalize_run_template_binding(DEFAULT_RUN_TEMPLATE_BINDING)
        return _with_run_template_binding_repair_metadata(
            binding,
            reason="invalid_saved_binding",
            previous_value=value,
            error=str(exc),
        )


def save_run_template_binding(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    next_value = _normalize_run_template_binding(payload)
    previous = load_run_template_binding()
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


def load_memory_review_template_binding() -> dict[str, Any]:
    with _connection() as connection:
        row = connection.execute(
            "SELECT value_json FROM buddy_kv WHERE key = ?",
            (MEMORY_REVIEW_TEMPLATE_BINDING_KEY,),
        ).fetchone()
    if not row:
        return _normalize_memory_review_template_binding(DEFAULT_MEMORY_REVIEW_TEMPLATE_BINDING)
    try:
        value = json.loads(str(row["value_json"] or "{}"))
    except Exception:
        value = {}
    if not isinstance(value, dict):
        value = {}
    return _normalize_memory_review_template_binding(value)


def save_memory_review_template_binding(
    payload: dict[str, Any],
    *,
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    next_value = _normalize_memory_review_template_binding(payload)
    previous = load_memory_review_template_binding()
    _write_with_revision(
        MEMORY_REVIEW_TEMPLATE_BINDING_TARGET_TYPE,
        MEMORY_REVIEW_TEMPLATE_BINDING_TARGET_ID,
        "update",
        previous,
        next_value,
        changed_by,
        change_reason,
    )
    _write_kv(MEMORY_REVIEW_TEMPLATE_BINDING_KEY, next_value, next_value["updated_at"])
    return load_memory_review_template_binding()


def list_chat_sessions(*, include_deleted: bool = False) -> list[dict[str, Any]]:
    query = """
        SELECT session_id, title, archived, deleted, parent_session_id, source, ended_at, end_reason, created_at, updated_at
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
    parent_session_id = _normalize_optional_text((payload or {}).get("parent_session_id"))
    source = _normalize_session_source((payload or {}).get("source"))
    session = {
        "session_id": f"session_{uuid4().hex[:12]}",
        "title": title or DEFAULT_CHAT_SESSION_TITLE,
        "archived": False,
        "deleted": False,
        "parent_session_id": parent_session_id,
        "source": source,
        "ended_at": _normalize_optional_text((payload or {}).get("ended_at")),
        "end_reason": _normalize_optional_text((payload or {}).get("end_reason")),
        "created_at": now,
        "updated_at": now,
    }
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_sessions
                (session_id, title, archived, deleted, parent_session_id, source, ended_at, end_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session["session_id"],
                session["title"],
                int(session["archived"]),
                int(session["deleted"]),
                session["parent_session_id"],
                session["source"],
                session["ended_at"],
                session["end_reason"],
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
            SELECT session_id, title, archived, deleted, parent_session_id, source, ended_at, end_reason, created_at, updated_at
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
    next_parent_session_id = previous.get("parent_session_id")
    if "parent_session_id" in payload:
        next_parent_session_id = _normalize_optional_text(payload.get("parent_session_id"))
    next_source = previous.get("source") or "buddy"
    if "source" in payload:
        next_source = _normalize_session_source(payload.get("source"))
    next_ended_at = previous.get("ended_at")
    if "ended_at" in payload:
        next_ended_at = _normalize_optional_text(payload.get("ended_at"))
    next_end_reason = previous.get("end_reason")
    if "end_reason" in payload:
        next_end_reason = _normalize_optional_text(payload.get("end_reason"))
    now = utc_now_iso()
    with _connection() as connection:
        connection.execute(
            """
            UPDATE buddy_sessions
            SET title = ?, archived = ?, parent_session_id = ?, source = ?, ended_at = ?, end_reason = ?, updated_at = ?
            WHERE session_id = ?
            """,
            (
                next_title,
                int(next_archived),
                next_parent_session_id,
                next_source,
                next_ended_at,
                next_end_reason,
                now,
                session_id,
            ),
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


def recall_chat_messages(
    *,
    mode: str = "browse",
    query: str = "",
    session_id: str | None = None,
    anchor_message_id: str | None = None,
    direction: str = "around",
    limit: int = 10,
    window: int = DEFAULT_RECALL_WINDOW,
    bookend: int = DEFAULT_RECALL_BOOKEND,
    sort: str | None = None,
    role_filter: Any = None,
    current_session_id: str | None = None,
) -> dict[str, Any]:
    normalized_mode = str(mode or "browse").strip().lower()
    normalized_limit = _bounded_int(limit, default=10, minimum=1, maximum=MAX_RECALL_LIMIT)
    normalized_window = _bounded_int(window, default=DEFAULT_RECALL_WINDOW, minimum=0, maximum=MAX_RECALL_WINDOW)
    normalized_bookend = _bounded_int(bookend, default=DEFAULT_RECALL_BOOKEND, minimum=0, maximum=10)
    normalized_query = str(query or "").strip()
    normalized_sort = _normalize_recall_sort(sort)
    normalized_roles = _normalize_role_filter(role_filter)
    if normalized_mode == "discover":
        return _recall_chat_messages_discover(
            query=normalized_query,
            limit=normalized_limit,
            window=normalized_window,
            bookend=normalized_bookend,
            sort=normalized_sort,
            role_filter=normalized_roles,
            current_session_id=str(current_session_id or "").strip(),
        )
    if normalized_mode == "scroll":
        return _recall_chat_messages_scroll(
            session_id=str(session_id or "").strip(),
            anchor_message_id=str(anchor_message_id or "").strip(),
            direction=str(direction or "around").strip().lower(),
            window=normalized_window,
            current_session_id=str(current_session_id or "").strip(),
        )
    return _recall_chat_messages_browse(limit=normalized_limit)


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


def _recall_chat_messages_browse(*, limit: int) -> dict[str, Any]:
    sessions = _list_browsable_recall_sessions(limit=limit)
    return {
        "kind": "buddy_session_recall",
        "mode": "browse",
        "query": "",
        "hit_count": 0,
        "session_count": len(sessions),
        "sessions": [{**session, "messages": [], "hit_message_ids": []} for session in sessions],
    }


def _list_browsable_recall_sessions(*, limit: int) -> list[dict[str, Any]]:
    sessions: list[dict[str, Any]] = []
    seen_lineage_roots: set[str] = set()
    for listed_session in list_chat_sessions():
        if not _is_recall_visible_session(listed_session):
            continue
        listed_session_id = str(listed_session.get("session_id") or "")
        lineage_root = _resolve_session_lineage_root(listed_session_id)
        if not lineage_root or lineage_root in seen_lineage_roots:
            continue
        projected_session_id = _resolve_compressed_lineage_tip(lineage_root)
        if listed_session_id not in {lineage_root, projected_session_id}:
            continue
        try:
            projected_session = get_chat_session(projected_session_id)
        except KeyError:
            continue
        if not _is_recall_visible_session(projected_session):
            continue
        sessions.append(
            {
                **projected_session,
                "lineage_root_session_id": lineage_root,
            }
        )
        seen_lineage_roots.add(lineage_root)
        if len(sessions) >= limit:
            break
    return sessions


def _is_recall_visible_session(session: dict[str, Any]) -> bool:
    return (
        not bool(session.get("archived"))
        and not bool(session.get("deleted"))
        and str(session.get("source") or "buddy") not in HIDDEN_SESSION_SOURCES
    )


def _resolve_compressed_lineage_tip(session_id: str) -> str:
    if not session_id:
        return ""
    hidden_placeholders = ",".join("?" for _ in HIDDEN_SESSION_SOURCES)
    source_filter = f"AND source NOT IN ({hidden_placeholders})" if hidden_placeholders else ""
    current = session_id
    visited: set[str] = set()
    with _connection() as connection:
        while current and current not in visited:
            visited.add(current)
            parent = connection.execute(
                """
                SELECT session_id, ended_at, end_reason
                FROM buddy_sessions
                WHERE session_id = ? AND deleted = 0
                """,
                (current,),
            ).fetchone()
            if not parent or str(parent["end_reason"] or "") != "compression":
                return current
            params: tuple[Any, ...]
            if hidden_placeholders:
                params = (current, *sorted(HIDDEN_SESSION_SOURCES))
            else:
                params = (current,)
            rows = connection.execute(
                f"""
                SELECT session_id, created_at, updated_at
                FROM buddy_sessions
                WHERE parent_session_id = ?
                  AND deleted = 0
                  AND archived = 0
                  {source_filter}
                ORDER BY created_at DESC, updated_at DESC, rowid DESC
                """,
                params,
            ).fetchall()
            next_session_id = ""
            parent_ended_at = str(parent["ended_at"] or "")
            for row in rows:
                child_created_at = str(row["created_at"] or "")
                if not parent_ended_at or not child_created_at or child_created_at >= parent_ended_at:
                    next_session_id = str(row["session_id"] or "")
                    break
            if not next_session_id:
                return current
            current = next_session_id
    return current or session_id


def _recall_chat_messages_discover(
    *,
    query: str,
    limit: int,
    window: int,
    bookend: int,
    sort: str,
    role_filter: tuple[str, ...],
    current_session_id: str = "",
) -> dict[str, Any]:
    if not query:
        return _recall_chat_messages_browse(limit=limit)
    raw_hits = _search_chat_message_hits(
        query,
        limit=max(50, limit * 10),
        sort=sort,
        role_filter=role_filter,
    )
    session_entries: list[dict[str, Any]] = []
    seen_lineage_roots: set[str] = set()
    current_root = _resolve_session_lineage_root(current_session_id) if current_session_id else ""
    for hit in raw_hits:
        hit_session_id = str(hit.get("session_id") or "")
        lineage_root = _resolve_session_lineage_root(hit_session_id)
        if current_root and lineage_root == current_root:
            continue
        dedupe_key = lineage_root or hit_session_id
        if dedupe_key in seen_lineage_roots:
            continue
        session = get_chat_session(hit_session_id)
        view = _get_anchored_message_view(
            session_id=hit_session_id,
            anchor_message_id=str(hit.get("message_id") or ""),
            window=window,
            bookend=bookend,
            role_filter=role_filter,
        )
        if not view["messages"]:
            continue
        entry = {
            **session,
            "lineage_root_session_id": lineage_root or hit_session_id,
            "matched_role": str(hit.get("role") or ""),
            "match_message_id": str(hit.get("message_id") or ""),
            "snippet": str(hit.get("snippet") or ""),
            "bookend_start": view["bookend_start"],
            "messages": view["messages"],
            "bookend_end": view["bookend_end"],
            "messages_before": view["messages_before"],
            "messages_after": view["messages_after"],
            "has_more_before": view["has_more_before"],
            "has_more_after": view["has_more_after"],
            "hit_message_ids": [
                str(candidate.get("message_id") or "")
                for candidate in raw_hits
                if _resolve_session_lineage_root(str(candidate.get("session_id") or "")) == dedupe_key
            ],
        }
        session_entries.append(entry)
        seen_lineage_roots.add(dedupe_key)
        if len(session_entries) >= limit:
            break
    return {
        "kind": "buddy_session_recall",
        "mode": "discover",
        "query": query,
        "hit_count": len(raw_hits),
        "session_count": len(session_entries),
        "sessions": session_entries,
    }


def _recall_chat_messages_scroll(
    *,
    session_id: str,
    anchor_message_id: str,
    direction: str,
    window: int,
    current_session_id: str = "",
) -> dict[str, Any]:
    if not session_id:
        raise ValueError("session_id is required for scroll recall.")
    session = get_chat_session(session_id)
    if current_session_id:
        target_root = _resolve_session_lineage_root(session_id)
        current_root = _resolve_session_lineage_root(current_session_id)
        if target_root and current_root and target_root == current_root:
            raise ValueError("scroll target is already in the current session lineage.")
    if anchor_message_id:
        anchor_owner = _safe_message_session_id(anchor_message_id)
        if anchor_owner and anchor_owner != session_id:
            if _resolve_session_lineage_root(anchor_owner) == _resolve_session_lineage_root(session_id):
                session_id = anchor_owner
                session = get_chat_session(session_id)
            else:
                raise ValueError(f"anchor_message_id {anchor_message_id} is not in session {session_id}.")
    view = _get_anchored_message_view(
        session_id=session_id,
        anchor_message_id=anchor_message_id,
        window=window,
        bookend=0,
        role_filter=("user", "assistant"),
        direction=direction,
    )
    return {
        "kind": "buddy_session_recall",
        "mode": "scroll",
        "query": "",
        "hit_count": 1 if view["messages"] else 0,
        "session_count": 1,
        "sessions": [
            {
                **session,
                "lineage_root_session_id": _resolve_session_lineage_root(session_id) or session_id,
                "messages": view["messages"],
                "hit_message_ids": [anchor_message_id] if anchor_message_id else [],
                "messages_before": view["messages_before"],
                "messages_after": view["messages_after"],
                "has_more_before": view["has_more_before"],
                "has_more_after": view["has_more_after"],
            }
        ],
    }


def _search_chat_message_hits(
    query: str,
    *,
    limit: int,
    sort: str,
    role_filter: tuple[str, ...],
) -> list[dict[str, Any]]:
    if not query.strip():
        return []
    if _contains_cjk(query):
        cjk_tokens = _query_search_tokens(query, cjk_only=True)
        if cjk_tokens and all(_count_cjk(token) >= 3 for token in cjk_tokens):
            rows = _search_chat_message_hits_fts(
                _trigram_query(query),
                limit=limit,
                sort=sort,
                role_filter=role_filter,
                table_name="buddy_messages_fts_trigram",
            )
            if rows:
                return rows
        return _search_chat_message_hits_like(query, limit=limit, role_filter=role_filter)

    match_query = _sanitize_fts5_query(query)
    rows = _search_chat_message_hits_fts(
        match_query,
        limit=limit,
        sort=sort,
        role_filter=role_filter,
        table_name="buddy_messages_fts",
    )
    if rows:
        return rows
    return _search_chat_message_hits_like(query, limit=limit, role_filter=role_filter)


def _search_chat_message_hits_fts(
    match_query: str,
    *,
    limit: int,
    sort: str,
    role_filter: tuple[str, ...],
    table_name: str,
) -> list[dict[str, Any]]:
    if not match_query:
        return []
    if table_name not in {"buddy_messages_fts", "buddy_messages_fts_trigram"}:
        raise ValueError("Unsupported Buddy message FTS table.")
    order_by = _fts_order_by_sql(sort)
    role_placeholders = ",".join("?" for _ in role_filter)
    hidden_placeholders = ",".join("?" for _ in HIDDEN_SESSION_SOURCES)
    source_filter = f"AND bs.source NOT IN ({hidden_placeholders})" if hidden_placeholders else ""
    sql = f"""
        SELECT
            bm.message_id,
            bm.session_id,
            bm.role,
            snippet({table_name}, 3, '>>>', '<<<', '...', 40) AS snippet,
            bm.content,
            bm.created_at,
            bs.parent_session_id,
            bs.source,
            rank
        FROM {table_name}
        JOIN buddy_messages AS bm ON bm.rowid = {table_name}.rowid
        JOIN buddy_sessions AS bs ON bs.session_id = bm.session_id
        WHERE {table_name}.content MATCH ?
          AND bs.deleted = 0
          AND bs.archived = 0
          {source_filter}
          AND bm.include_in_context = 1
          AND bm.role IN ({role_placeholders})
        {order_by}
        LIMIT ?
    """
    params: list[Any] = [match_query, *sorted(HIDDEN_SESSION_SOURCES), *role_filter, limit]
    with _connection() as connection:
        try:
            rows = connection.execute(sql, params).fetchall()
        except Exception:
            return []
    return _dedupe_hit_rows([_hit_from_row(row) for row in rows])


def _search_chat_message_hits_like(
    query: str,
    *,
    limit: int,
    role_filter: tuple[str, ...],
) -> list[dict[str, Any]]:
    tokens = _query_search_tokens(query) or [query.strip()]
    if not tokens:
        return []
    role_placeholders = ",".join("?" for _ in role_filter)
    hidden_placeholders = ",".join("?" for _ in HIDDEN_SESSION_SOURCES)
    source_filter = f"AND bs.source NOT IN ({hidden_placeholders})" if hidden_placeholders else ""
    token_clauses = []
    params: list[Any] = []
    for token in tokens:
        escaped = _escape_like_token(token)
        token_clauses.append("bm.content LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    sql = f"""
        SELECT
            bm.message_id,
            bm.session_id,
            bm.role,
            bm.content,
            bm.created_at,
            bs.parent_session_id,
            bs.source
        FROM buddy_messages AS bm
        JOIN buddy_sessions AS bs ON bs.session_id = bm.session_id
        WHERE ({' OR '.join(token_clauses)})
          AND bs.deleted = 0
          AND bs.archived = 0
          {source_filter}
          AND bm.include_in_context = 1
          AND bm.role IN ({role_placeholders})
        ORDER BY bm.created_at DESC, bm.rowid DESC
        LIMIT ?
    """
    params.extend([*sorted(HIDDEN_SESSION_SOURCES), *role_filter, limit])
    with _connection() as connection:
        rows = connection.execute(sql, params).fetchall()
    first_token = tokens[0]
    hits = []
    for row in rows:
        hit = _hit_from_row(row)
        hit["snippet"] = _make_text_snippet(str(row["content"] or ""), tokens=[first_token, *tokens[1:]])
        hits.append(hit)
    return _dedupe_hit_rows(hits)


def _hit_from_row(row: Any) -> dict[str, Any]:
    return {
        "message_id": str(row["message_id"] or ""),
        "session_id": str(row["session_id"] or ""),
        "role": str(row["role"] or ""),
        "snippet": str(row["snippet"] or "") if _row_has_key(row, "snippet") else "",
        "created_at": str(row["created_at"] or ""),
        "parent_session_id": row["parent_session_id"] if _row_has_key(row, "parent_session_id") else None,
        "source": str(row["source"] or "buddy") if _row_has_key(row, "source") else "buddy",
    }


def _dedupe_hit_rows(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for hit in hits:
        message_id = str(hit.get("message_id") or "")
        if message_id and message_id not in seen:
            seen.add(message_id)
            deduped.append(hit)
    return deduped


def _safe_message_session_id(message_id: str) -> str:
    try:
        return str(_get_chat_message(message_id).get("session_id") or "")
    except KeyError:
        return ""


def _get_anchored_message_view(
    *,
    session_id: str,
    anchor_message_id: str,
    window: int,
    bookend: int,
    role_filter: tuple[str, ...],
    direction: str = "around",
) -> dict[str, Any]:
    messages = [
        message
        for message in list_chat_messages(session_id)
        if _is_recall_context_message(message, role_filter)
    ]
    if not messages:
        return _empty_anchored_message_view()
    anchor_index = 0
    if anchor_message_id:
        for index, message in enumerate(messages):
            if message["message_id"] == anchor_message_id:
                anchor_index = index
                break
        else:
            return _empty_anchored_message_view()
    if direction == "before":
        start = max(0, anchor_index - window)
        end = anchor_index + 1
    elif direction == "after":
        start = anchor_index
        end = min(len(messages), anchor_index + window + 1)
    else:
        start = max(0, anchor_index - window)
        end = min(len(messages), anchor_index + window + 1)
    window_messages = messages[start:end]
    before_candidates = messages[:start]
    after_candidates = messages[end:]
    return {
        "messages": window_messages,
        "bookend_start": before_candidates[:bookend] if bookend else [],
        "bookend_end": after_candidates[-bookend:] if bookend else [],
        "messages_before": max(0, anchor_index - start),
        "messages_after": max(0, end - anchor_index - 1),
        "has_more_before": start > 0,
        "has_more_after": end < len(messages),
    }


def _is_recall_context_message(message: dict[str, Any], role_filter: tuple[str, ...]) -> bool:
    return (
        bool(message.get("include_in_context", True))
        and message.get("role") in role_filter
        and bool(str(message.get("content") or "").strip())
    )


def _empty_anchored_message_view() -> dict[str, Any]:
    return {
        "messages": [],
        "bookend_start": [],
        "bookend_end": [],
        "messages_before": 0,
        "messages_after": 0,
        "has_more_before": False,
        "has_more_after": False,
    }


def _sanitize_fts5_query(query: str) -> str:
    quoted_parts: list[str] = []

    def preserve_quoted(match: re.Match[str]) -> str:
        quoted_parts.append(match.group(0))
        return f"\x00Q{len(quoted_parts) - 1}\x00"

    sanitized = re.sub(r'"[^"]*"', preserve_quoted, query)
    sanitized = re.sub(r'[+{}()"^]', " ", sanitized)
    sanitized = re.sub(r"\*+", "*", sanitized)
    sanitized = re.sub(r"(^|\s)\*", r"\1", sanitized)
    sanitized = re.sub(r"(?i)^(AND|OR|NOT)\b\s*", "", sanitized.strip())
    sanitized = re.sub(r"(?i)\s+(AND|OR|NOT)\s*$", "", sanitized.strip())
    sanitized = re.sub(r"\b(\w+(?:[._-]\w+)+)\b", r'"\1"', sanitized)
    for index, quoted in enumerate(quoted_parts):
        sanitized = sanitized.replace(f"\x00Q{index}\x00", quoted)
    return sanitized.strip()


def _trigram_query(query: str) -> str:
    tokens = _query_search_tokens(query, preserve_operators=True)
    parts = []
    for token in tokens:
        if token.upper() in {"AND", "OR", "NOT"}:
            parts.append(token.upper())
        else:
            parts.append(f'"{token.replace(chr(34), chr(34) * 2)}"')
    return " ".join(parts)


def _query_search_tokens(
    query: str,
    *,
    cjk_only: bool = False,
    preserve_operators: bool = False,
) -> list[str]:
    raw = query.strip().strip('"')
    tokens = [token.strip().strip('"') for token in raw.split() if token.strip().strip('"')]
    if not tokens and raw:
        tokens = [raw]
    results: list[str] = []
    for token in tokens:
        upper = token.upper()
        if upper in {"AND", "OR", "NOT"}:
            if preserve_operators:
                results.append(upper)
            continue
        if cjk_only and not _contains_cjk(token):
            continue
        results.append(token)
    return results


def _contains_cjk(text: str) -> bool:
    return any(_is_cjk_codepoint(ord(character)) for character in text)


def _count_cjk(text: str) -> int:
    return sum(1 for character in text if _is_cjk_codepoint(ord(character)))


def _is_cjk_codepoint(codepoint: int) -> bool:
    return (
        0x4E00 <= codepoint <= 0x9FFF
        or 0x3400 <= codepoint <= 0x4DBF
        or 0x20000 <= codepoint <= 0x2A6DF
        or 0x3000 <= codepoint <= 0x303F
        or 0x3040 <= codepoint <= 0x309F
        or 0x30A0 <= codepoint <= 0x30FF
        or 0xAC00 <= codepoint <= 0xD7AF
    )


def _escape_like_token(token: str) -> str:
    return token.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _make_text_snippet(content: str, *, tokens: list[str]) -> str:
    normalized_tokens = [token for token in tokens if token and token.upper() not in {"AND", "OR", "NOT"}]
    for token in normalized_tokens:
        index = content.find(token)
        if index >= 0:
            start = max(0, index - 40)
            end = min(len(content), index + len(token) + 40)
            prefix = "..." if start > 0 else ""
            suffix = "..." if end < len(content) else ""
            return f"{prefix}{content[start:index]}>>>{content[index:index + len(token)]}<<<{content[index + len(token):end]}{suffix}"
    return content[:120]


def _fts_order_by_sql(sort: str) -> str:
    if sort == "newest":
        return "ORDER BY bm.created_at DESC, rank"
    if sort == "oldest":
        return "ORDER BY bm.created_at ASC, rank"
    return "ORDER BY rank"


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _normalize_recall_sort(value: Any) -> str:
    normalized = str(value or "rank").strip().lower()
    return normalized if normalized in {"rank", "newest", "oldest"} else "rank"


def _normalize_role_filter(value: Any) -> tuple[str, ...]:
    allowed = {"user", "assistant"}
    if isinstance(value, str):
        candidates = [item.strip() for item in value.split(",")]
    elif isinstance(value, list | tuple | set):
        candidates = [str(item).strip() for item in value]
    else:
        candidates = []
    roles = tuple(role for role in candidates if role in allowed)
    return roles or ("user", "assistant")


def _resolve_session_lineage_root(session_id: str) -> str:
    if not session_id:
        return ""
    visited: set[str] = set()
    current = session_id
    with _connection() as connection:
        while current and current not in visited:
            visited.add(current)
            row = connection.execute(
                "SELECT parent_session_id FROM buddy_sessions WHERE session_id = ?",
                (current,),
            ).fetchone()
            if not row:
                return session_id
            parent = str(row["parent_session_id"] or "").strip()
            if not parent:
                return current
            current = parent
    return current or session_id


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
    elif target_type == "home_file" and target_id == MEMORY_PATH:
        current = load_memory_document()
        next_value = {
            "path": MEMORY_PATH,
            "content": str(restored.get("content") or ""),
            "updated_at": utc_now_iso(),
        }
        if not next_value["content"].strip():
            raise ValueError("Cannot restore an empty MEMORY.md revision.")
        _write_with_revision("home_file", MEMORY_PATH, "restore", current, next_value, changed_by, change_reason)
        (BUDDY_HOME_DIR / MEMORY_PATH).write_text(next_value["content"], encoding="utf-8")
        restored = load_memory_document()
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
    elif target_type == CAPABILITY_USAGE_STATS_TARGET_TYPE:
        current = load_capability_usage_stats()
        restored = _normalize_capability_usage_stats(restored)
        _write_with_revision(
            CAPABILITY_USAGE_STATS_TARGET_TYPE,
            CAPABILITY_USAGE_STATS_TARGET_ID,
            "restore",
            current,
            restored,
            changed_by,
            change_reason,
        )
        _write_kv(CAPABILITY_USAGE_STATS_KEY, restored, utc_now_iso())
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
    elif target_type == MEMORY_REVIEW_TEMPLATE_BINDING_TARGET_TYPE:
        current = load_memory_review_template_binding()
        restored = _normalize_memory_review_template_binding(restored)
        _write_with_revision(
            MEMORY_REVIEW_TEMPLATE_BINDING_TARGET_TYPE,
            MEMORY_REVIEW_TEMPLATE_BINDING_TARGET_ID,
            "restore",
            current,
            restored,
            changed_by,
            change_reason,
        )
        _write_kv(MEMORY_REVIEW_TEMPLATE_BINDING_KEY, restored, utc_now_iso())
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
    _ensure_run_template_can_be_bound(template_id)
    raw_bindings = payload.get("input_bindings")
    if not isinstance(raw_bindings, dict):
        raise ValueError("input_bindings must be an object.")
    input_bindings: dict[str, str] = {}
    for node_id, source in raw_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        normalized_source = str(source or "").strip()
        if not normalized_node_id or not normalized_source:
            continue
        if normalized_source in DEPRECATED_BUDDY_INPUT_SOURCES:
            continue
        if normalized_source not in ALLOWED_RUN_TEMPLATE_INPUT_SOURCES:
            raise ValueError(f"Unsupported Buddy input source: {normalized_source}")
        input_bindings[normalized_node_id] = normalized_source
    if template_id == DEFAULT_RUN_TEMPLATE_BINDING["template_id"]:
        for node_id, source in DEFAULT_RUN_TEMPLATE_BINDING["input_bindings"].items():
            input_bindings.setdefault(node_id, source)
    current_message_count = sum(1 for source in input_bindings.values() if source == "current_message")
    if current_message_count != 1:
        raise ValueError("current_message must be bound exactly once.")
    return {
        "version": RUN_TEMPLATE_BINDING_VERSION,
        "template_id": template_id,
        "input_bindings": input_bindings,
        "updated_at": str(payload.get("updated_at") or utc_now_iso()),
    }


def _run_template_binding_needs_repair(raw_value: dict[str, Any], normalized_value: dict[str, Any]) -> bool:
    raw_template_id = str(raw_value.get("template_id") or "").strip()
    normalized_template_id = str(normalized_value.get("template_id") or "").strip()
    raw_bindings = raw_value.get("input_bindings") if isinstance(raw_value.get("input_bindings"), dict) else {}
    normalized_bindings = normalized_value.get("input_bindings")
    raw_version = int(raw_value.get("version") or RUN_TEMPLATE_BINDING_VERSION)
    normalized_version = int(normalized_value.get("version") or RUN_TEMPLATE_BINDING_VERSION)
    return (
        raw_template_id != normalized_template_id
        or raw_bindings != normalized_bindings
        or raw_version != normalized_version
    )


def _with_run_template_binding_repair_metadata(
    binding: dict[str, Any],
    *,
    reason: str,
    previous_value: dict[str, Any],
    error: str = "",
) -> dict[str, Any]:
    return {
        **binding,
        "repair_recommended": True,
        "repair_reason": reason,
        "repair_previous_template_id": str(previous_value.get("template_id") or ""),
        "repair_error": error,
    }


def _normalize_memory_review_template_binding(payload: dict[str, Any]) -> dict[str, Any]:
    template_id = str(payload.get("template_id") or "").strip()
    if not template_id:
        raise ValueError("template_id is required.")
    _ensure_memory_review_template_can_be_bound(template_id)
    raw_bindings = payload.get("input_bindings")
    if not isinstance(raw_bindings, dict):
        raise ValueError("input_bindings must be an object.")
    input_bindings: dict[str, str] = {}
    for node_id, source in raw_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        normalized_source = str(source or "").strip()
        if not normalized_node_id or not normalized_source:
            continue
        if normalized_source in DEPRECATED_BUDDY_INPUT_SOURCES:
            continue
        if normalized_source not in ALLOWED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES:
            raise ValueError(f"Unsupported Buddy memory review input source: {normalized_source}")
        if normalized_source in input_bindings.values():
            raise ValueError(f"Buddy memory review input source is already bound: {normalized_source}")
        input_bindings[normalized_node_id] = normalized_source
    missing_sources = sorted(REQUIRED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES - set(input_bindings.values()))
    if missing_sources:
        raise ValueError(f"Missing required Buddy memory review input source(s): {', '.join(missing_sources)}")
    return {
        "version": MEMORY_REVIEW_TEMPLATE_BINDING_VERSION,
        "template_id": template_id,
        "input_bindings": input_bindings,
        "updated_at": str(payload.get("updated_at") or utc_now_iso()),
    }


def _ensure_run_template_can_be_bound(template_id: str) -> None:
    from app.templates.loader import load_template_record, template_has_breakpoint_metadata

    template = load_template_record(template_id)
    if template_has_breakpoint_metadata(template):
        raise ValueError("Buddy run template binding cannot target a template with breakpoint metadata.")


def _ensure_memory_review_template_can_be_bound(template_id: str) -> None:
    from app.templates.loader import load_template_record, template_has_breakpoint_metadata

    template = load_template_record(template_id)
    if template_has_breakpoint_metadata(template):
        raise ValueError("Buddy memory review template binding cannot target a template with breakpoint metadata.")
    metadata = template.get("metadata") if isinstance(template.get("metadata"), dict) else {}
    role = str(metadata.get("role") or "").strip()
    if role == "buddy_autonomous_review" or metadata.get("buddy_memory_review") is True or metadata.get("buddyMemoryReview") is True:
        return
    raise ValueError("Buddy memory review template binding must target a Buddy memory review template.")


def _write_json(file_name: str, payload: Any) -> None:
    write_json_file(buddy_home_path(file_name), payload)


def _write_kv(key: str, payload: dict[str, Any], updated_at: str) -> None:
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_kv (key, value_json, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
            """,
            (key, _json_dumps(payload), updated_at),
        )
        connection.commit()


def _normalize_capability_usage_stats(payload: dict[str, Any]) -> dict[str, Any]:
    capabilities = payload.get("capabilities") if isinstance(payload.get("capabilities"), dict) else {}
    normalized_capabilities: dict[str, Any] = {}
    for capability_id, record in capabilities.items():
        if isinstance(record, dict):
            normalized_capabilities[str(capability_id)] = _normalize_capability_usage_record(record)
    return {
        "version": 1,
        "capabilities": normalized_capabilities,
        "updated_at": str(payload.get("updated_at") or ""),
    }


def _normalize_capability_usage_record(record: dict[str, Any]) -> dict[str, Any]:
    recent_runs = record.get("recent_runs") if isinstance(record.get("recent_runs"), list) else []
    return {
        "kind": str(record.get("kind") or "action"),
        "key": str(record.get("key") or ""),
        "name": str(record.get("name") or record.get("key") or ""),
        "use_count": int(record.get("use_count") or 0),
        "success_count": int(record.get("success_count") or 0),
        "failure_count": int(record.get("failure_count") or 0),
        "last_used_at": str(record.get("last_used_at") or ""),
        "last_run_id": str(record.get("last_run_id") or ""),
        "last_summary": str(record.get("last_summary") or ""),
        "last_duration_ms": int(record.get("last_duration_ms") or 0),
        "recent_runs": [item for item in recent_runs if isinstance(item, dict)][:MAX_CAPABILITY_USAGE_RECENT_RUNS],
    }


def _coerce_capability_usage_entries(payload: dict[str, Any]) -> list[dict[str, Any]]:
    entries = payload.get("entries")
    if isinstance(entries, list):
        return [entry for entry in entries if isinstance(entry, dict)]
    return [payload]


def _apply_capability_usage_entry(stats: dict[str, Any], entry: dict[str, Any], *, now: str) -> None:
    capability = entry.get("capability") if isinstance(entry.get("capability"), dict) else {}
    kind = str(capability.get("kind") or entry.get("kind") or "action").strip() or "action"
    key = str(capability.get("key") or entry.get("key") or "").strip()
    if not key:
        raise ValueError("capability_usage_stats.update requires capability.key.")
    name = str(capability.get("name") or entry.get("name") or key).strip() or key
    capability_id = f"{kind}:{key}"
    capabilities = stats.setdefault("capabilities", {})
    existing = _normalize_capability_usage_record(capabilities.get(capability_id) if isinstance(capabilities.get(capability_id), dict) else {})
    success = bool(entry.get("success", True))
    run_id = str(entry.get("run_id") or "").strip()
    summary = str(entry.get("summary") or "").strip()
    duration_ms = _coerce_non_negative_int(entry.get("duration_ms"))
    next_record = {
        **existing,
        "kind": kind,
        "key": key,
        "name": name,
        "use_count": int(existing.get("use_count") or 0) + 1,
        "success_count": int(existing.get("success_count") or 0) + (1 if success else 0),
        "failure_count": int(existing.get("failure_count") or 0) + (0 if success else 1),
        "last_used_at": now,
        "last_run_id": run_id,
        "last_summary": summary,
        "last_duration_ms": duration_ms,
    }
    recent_entry = {
        "run_id": run_id,
        "success": success,
        "summary": summary,
        "duration_ms": duration_ms,
        "used_at": now,
    }
    next_record["recent_runs"] = [recent_entry, *existing.get("recent_runs", [])][:MAX_CAPABILITY_USAGE_RECENT_RUNS]
    capabilities[capability_id] = next_record


def _coerce_non_negative_int(value: Any) -> int:
    try:
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return 0


def _home_file_entry(
    path: Path,
    relative_path: str,
    *,
    kind: str | None = None,
    readable: bool | None = None,
    summary: str = "",
) -> dict[str, Any]:
    exists = path.exists()
    is_directory = path.is_dir()
    resolved_kind = kind or _home_file_kind(relative_path, is_directory=is_directory)
    can_read = (not is_directory and resolved_kind in {"markdown", "json", "text"}) if readable is None else readable
    content = ""
    truncated = False
    error = ""
    if exists and can_read:
        try:
            content = path.read_text(encoding="utf-8")
        except Exception as exc:
            can_read = False
            error = str(exc)
        if len(content) > MAX_BUDDY_HOME_FILE_CONTENT_CHARS:
            content = content[:MAX_BUDDY_HOME_FILE_CONTENT_CHARS]
            truncated = True
    stat = path.stat() if exists else None
    return {
        "path": relative_path,
        "kind": resolved_kind,
        "exists": exists,
        "readable": can_read,
        "size_bytes": stat.st_size if stat else 0,
        "updated_at": _format_file_timestamp(stat.st_mtime) if stat else "",
        "content": content,
        "truncated": truncated,
        "summary": summary or _home_file_summary(relative_path, resolved_kind),
        "error": error,
    }


def _home_file_kind(relative_path: str, *, is_directory: bool) -> str:
    if is_directory:
        return "directory"
    if relative_path.endswith(".md"):
        return "markdown"
    if relative_path.endswith(".json"):
        return "json"
    return "text"


def _home_file_summary(relative_path: str, kind: str) -> str:
    summaries = {
        AGENTS_PATH: "Buddy Home operating instructions.",
        SOUL_PATH: "Buddy profile, persona, tone, and display preferences.",
        USER_PATH: "Durable context about the human Buddy helps.",
        MEMORY_PATH: "Curated long-term memory.",
        POLICY_PATH: "Behavior and communication policy.",
    }
    if relative_path in summaries:
        return summaries[relative_path]
    if kind == "markdown":
        return "Markdown note in Buddy Home."
    return ""


def _format_file_timestamp(value: float) -> str:
    return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()


@contextmanager
def _connection() -> Iterator[Any]:
    connection = open_buddy_database(BUDDY_HOME_DIR)
    try:
        yield connection
    finally:
        connection.close()


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
        "parent_session_id": row["parent_session_id"] if _row_has_key(row, "parent_session_id") else None,
        "source": str(row["source"] or "buddy") if _row_has_key(row, "source") else "buddy",
        "ended_at": row["ended_at"] if _row_has_key(row, "ended_at") else None,
        "end_reason": row["end_reason"] if _row_has_key(row, "end_reason") else None,
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


def _normalize_optional_text(value: Any) -> str | None:
    normalized = " ".join(str(value or "").strip().split())
    return normalized or None


def _normalize_session_source(value: Any) -> str:
    normalized = _normalize_optional_text(value) or "buddy"
    return normalized[:40]


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


def _row_has_key(row: Any, key: str) -> bool:
    try:
        return key in row.keys()
    except Exception:
        return False


def _merged_display_preferences(previous: dict[str, Any], cleaned: dict[str, Any]) -> dict[str, Any]:
    previous_preferences = previous.get("display_preferences")
    cleaned_preferences = cleaned.get("display_preferences")
    merged = deepcopy(previous_preferences) if isinstance(previous_preferences, dict) else {}
    if isinstance(cleaned_preferences, dict):
        merged.update(cleaned_preferences)
    return merged


def _clean_dict(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}

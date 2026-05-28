from __future__ import annotations

import json
import sqlite3
from typing import Any
from uuid import uuid4

from app.core.storage.database import get_connection


SUPPORTED_PLATFORM_IDS = {"telegram", "feishu"}
DEFAULT_ROUTING_MODE = "one_external_conversation_one_buddy_session"
DEFAULT_TRACE_MODE = "quiet"


def _json_dumps(value: Any) -> str:
    return json.dumps(value if value is not None else {}, ensure_ascii=False, sort_keys=True)


def _json_loads_object(value: str | None) -> dict[str, Any]:
    try:
        loaded = json.loads(value or "{}")
    except json.JSONDecodeError:
        return {}
    return loaded if isinstance(loaded, dict) else {}


def _is_platform_binding_configured(platform_id: str, config: dict[str, Any], secret_summary: dict[str, Any]) -> bool:
    if platform_id == "telegram":
        return bool(str(secret_summary.get("bot_token") or "").strip())
    if platform_id == "feishu":
        return bool(str(config.get("app_id") or "").strip() and str(secret_summary.get("app_secret") or "").strip())
    return bool(config or secret_summary)


def _row_to_binding(row: Any) -> dict[str, Any]:
    config = _json_loads_object(row["config_json"])
    secret_summary = _json_loads_object(row["secret_summary_json"])
    platform_id = row["platform_id"]
    return {
        "binding_id": row["binding_id"],
        "platform_id": platform_id,
        "display_name": row["display_name"],
        "enabled": bool(row["enabled"]),
        "configured": _is_platform_binding_configured(platform_id, config, secret_summary),
        "config": config,
        "secret_summary": secret_summary,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_to_status(row: Any) -> dict[str, Any]:
    return {
        "binding_id": row["binding_id"],
        "status": row["status"],
        "last_connected_at": row["last_connected_at"],
        "last_disconnected_at": row["last_disconnected_at"],
        "last_event_at": row["last_event_at"],
        "last_delivery_at": row["last_delivery_at"],
        "last_error_code": row["last_error_code"],
        "last_error_message": row["last_error_message"],
        "retry_count": int(row["retry_count"] or 0),
        "updated_at": row["updated_at"],
    }


def _row_to_platform_session(row: Any) -> dict[str, Any]:
    return {
        "platform_session_id": row["platform_session_id"],
        "platform_id": row["platform_id"],
        "binding_id": row["binding_id"],
        "external_conversation_key": row["external_conversation_key"],
        "external_chat_id": row["external_chat_id"],
        "external_thread_id": row["external_thread_id"],
        "external_user_id": row["external_user_id"],
        "external_chat_type": row["external_chat_type"],
        "external_display_name": row["external_display_name"],
        "buddy_session_id": row["buddy_session_id"],
        "routing_mode": row["routing_mode"],
        "buddy_model_ref": row["buddy_model_ref"],
        "model_updated_at": row["model_updated_at"],
        "model_updated_by_external_sender_id": row["model_updated_by_external_sender_id"],
        "trace_mode": row["trace_mode"],
        "status": row["status"],
        "title": row["title"],
        "last_inbound_at": row["last_inbound_at"],
        "last_outbound_at": row["last_outbound_at"],
        "last_run_id": row["last_run_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_to_audit_event(row: Any) -> dict[str, Any]:
    return {
        "event_id": row["event_id"],
        "binding_id": row["binding_id"],
        "platform_id": row["platform_id"],
        "platform_session_id": row["platform_session_id"],
        "event_type": row["event_type"],
        "severity": row["severity"],
        "message": row["message"],
        "payload": _json_loads_object(row["payload_json"]),
        "created_at": row["created_at"],
    }


def _require_supported_platform(platform_id: str) -> str:
    normalized = str(platform_id or "").strip()
    if normalized not in SUPPORTED_PLATFORM_IDS:
        raise ValueError("Unsupported message platform.")
    return normalized


def build_external_conversation_key(
    *,
    platform_id: str,
    chat_id: str,
    thread_id: str = "",
    sender_id: str = "",
    chat_type: str = "unknown",
) -> str:
    platform = str(platform_id or "").strip()
    chat = str(chat_id or "").strip()
    thread = str(thread_id or "").strip()
    sender = str(sender_id or "").strip()
    kind = str(chat_type or "").strip().lower()
    if platform == "telegram":
        if kind == "dm":
            return f"telegram:dm:{chat or sender}"
        if thread:
            return f"telegram:group:{chat}:topic:{thread}"
        return f"telegram:group:{chat}"
    if platform == "feishu":
        if kind == "dm":
            return f"feishu:dm:{chat or sender}"
        if thread:
            return f"feishu:chat:{chat}:thread:{thread}"
        return f"feishu:chat:{chat}"
    if thread:
        return f"{platform}:{kind or 'chat'}:{chat}:thread:{thread}"
    return f"{platform}:{kind or 'chat'}:{chat or sender}"


def upsert_platform_binding(payload: dict[str, Any]) -> dict[str, Any]:
    binding_id = str(payload.get("binding_id") or f"mpb_{uuid4().hex[:12]}")
    platform_id = _require_supported_platform(str(payload.get("platform_id") or ""))
    config = payload.get("config") if isinstance(payload.get("config"), dict) else {}
    secret_summary = payload.get("secret_summary") if isinstance(payload.get("secret_summary"), dict) else {}
    configured = _is_platform_binding_configured(platform_id, config, secret_summary)
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO message_platform_bindings
                (binding_id, platform_id, display_name, enabled, configured, config_json, secret_summary_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(binding_id) DO UPDATE SET
                platform_id = excluded.platform_id,
                display_name = excluded.display_name,
                enabled = excluded.enabled,
                configured = excluded.configured,
                config_json = excluded.config_json,
                secret_summary_json = excluded.secret_summary_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                binding_id,
                platform_id,
                str(payload.get("display_name") or platform_id),
                int(bool(payload.get("enabled"))),
                int(configured),
                _json_dumps(config),
                _json_dumps(secret_summary),
            ),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM message_platform_bindings WHERE binding_id = ?",
            (binding_id,),
        ).fetchone()
    return _row_to_binding(row)


def upsert_platform_secrets(binding_id: str, secrets: dict[str, str]) -> dict[str, str]:
    normalized_binding_id = str(binding_id or "").strip()
    if not normalized_binding_id:
        raise ValueError("binding_id is required.")
    cleaned = {
        str(key): str(value)
        for key, value in (secrets or {}).items()
        if str(key).strip() and str(value or "").strip()
    }
    if not cleaned:
        return get_platform_secrets(normalized_binding_id)
    existing = get_platform_secrets(normalized_binding_id)
    next_value = {**existing, **cleaned}
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO message_platform_secrets (binding_id, secret_json, updated_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(binding_id) DO UPDATE SET
                secret_json = excluded.secret_json,
                updated_at = CURRENT_TIMESTAMP
            """,
            (normalized_binding_id, _json_dumps(next_value)),
        )
        connection.commit()
    return get_platform_secrets(normalized_binding_id)


def get_platform_secrets(binding_id: str) -> dict[str, str]:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT secret_json FROM message_platform_secrets WHERE binding_id = ?",
            (str(binding_id or "").strip(),),
        ).fetchone()
    if row is None:
        return {}
    loaded = _json_loads_object(row["secret_json"])
    return {str(key): str(value) for key, value in loaded.items() if str(key).strip()}


def list_platform_bindings() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM message_platform_bindings ORDER BY platform_id, display_name"
        ).fetchall()
    return [_row_to_binding(row) for row in rows]


def get_platform_binding(binding_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM message_platform_bindings WHERE binding_id = ?",
            (binding_id,),
        ).fetchone()
    return _row_to_binding(row) if row else None


def list_connection_statuses() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM message_platform_connection_status ORDER BY binding_id"
        ).fetchall()
    return [_row_to_status(row) for row in rows]


def update_connection_status(binding_id: str, **updates: Any) -> dict[str, Any]:
    allowed = {
        "status",
        "last_connected_at",
        "last_disconnected_at",
        "last_event_at",
        "last_delivery_at",
        "last_error_code",
        "last_error_message",
        "retry_count",
    }
    values = {key: updates[key] for key in allowed if key in updates}
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO message_platform_connection_status (binding_id, status, updated_at)
            VALUES (?, 'not_configured', CURRENT_TIMESTAMP)
            ON CONFLICT(binding_id) DO NOTHING
            """,
            (binding_id,),
        )
        if values:
            assignments = ", ".join(f"{key} = ?" for key in values)
            connection.execute(
                f"""
                UPDATE message_platform_connection_status
                SET {assignments}, updated_at = CURRENT_TIMESTAMP
                WHERE binding_id = ?
                """,
                [*values.values(), binding_id],
            )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM message_platform_connection_status WHERE binding_id = ?",
            (binding_id,),
        ).fetchone()
    return _row_to_status(row)


def find_platform_session(
    *,
    platform_id: str,
    binding_id: str,
    external_conversation_key: str,
) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM message_platform_sessions
            WHERE platform_id = ? AND binding_id = ? AND external_conversation_key = ?
            """,
            (platform_id, binding_id, external_conversation_key),
        ).fetchone()
    return _row_to_platform_session(row) if row else None


def get_platform_session(platform_session_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM message_platform_sessions WHERE platform_session_id = ?",
            (platform_session_id,),
        ).fetchone()
    return _row_to_platform_session(row) if row else None


def resolve_or_create_platform_session(
    *,
    platform_id: str,
    binding_id: str,
    external_conversation_key: str,
    external_chat_id: str,
    external_thread_id: str = "",
    external_user_id: str = "",
    external_chat_type: str = "unknown",
    external_display_name: str = "",
    title: str = "",
    buddy_session_id: str,
    routing_mode: str = DEFAULT_ROUTING_MODE,
) -> dict[str, Any]:
    platform_session_id = f"mps_{uuid4().hex[:12]}"
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO message_platform_sessions (
                platform_session_id,
                platform_id,
                binding_id,
                external_conversation_key,
                external_chat_id,
                external_thread_id,
                external_user_id,
                external_chat_type,
                external_display_name,
                buddy_session_id,
                routing_mode,
                trace_mode,
                title,
                last_inbound_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT(platform_id, binding_id, external_conversation_key) DO UPDATE SET
                external_display_name = CASE
                    WHEN excluded.external_display_name != '' THEN excluded.external_display_name
                    ELSE message_platform_sessions.external_display_name
                END,
                last_inbound_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                platform_session_id,
                platform_id,
                binding_id,
                external_conversation_key,
                external_chat_id,
                external_thread_id,
                external_user_id,
                external_chat_type,
                external_display_name,
                buddy_session_id,
                routing_mode or DEFAULT_ROUTING_MODE,
                DEFAULT_TRACE_MODE,
                title,
            ),
        )
        connection.commit()
        row = connection.execute(
            """
            SELECT *
            FROM message_platform_sessions
            WHERE platform_id = ? AND binding_id = ? AND external_conversation_key = ?
            """,
            (platform_id, binding_id, external_conversation_key),
        ).fetchone()
    return _row_to_platform_session(row)


def set_platform_session_model_ref(
    platform_session_id: str,
    buddy_model_ref: str,
    *,
    updated_by: str = "",
) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE message_platform_sessions
            SET buddy_model_ref = ?,
                model_updated_at = CURRENT_TIMESTAMP,
                model_updated_by_external_sender_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE platform_session_id = ?
            """,
            (buddy_model_ref, updated_by, platform_session_id),
        )
        connection.commit()
    session = get_platform_session(platform_session_id)
    if not session:
        raise ValueError("Unknown message platform session.")
    return session


def set_platform_session_trace_mode(platform_session_id: str, trace_mode: str) -> dict[str, Any]:
    normalized = trace_mode if trace_mode in {"quiet", "summary", "debug"} else DEFAULT_TRACE_MODE
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE message_platform_sessions
            SET trace_mode = ?, updated_at = CURRENT_TIMESTAMP
            WHERE platform_session_id = ?
            """,
            (normalized, platform_session_id),
        )
        connection.commit()
    session = get_platform_session(platform_session_id)
    if not session:
        raise ValueError("Unknown message platform session.")
    return session


def rebind_platform_session(
    platform_session_id: str,
    buddy_session_id: str,
    *,
    updated_by: str = "",
) -> dict[str, Any]:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE message_platform_sessions
            SET buddy_session_id = ?,
                buddy_model_ref = '',
                model_updated_at = CURRENT_TIMESTAMP,
                model_updated_by_external_sender_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE platform_session_id = ?
            """,
            (buddy_session_id, updated_by, platform_session_id),
        )
        connection.commit()
    session = get_platform_session(platform_session_id)
    if not session:
        raise ValueError("Unknown message platform session.")
    return session


def mark_dedup_seen(
    *,
    platform_id: str,
    binding_id: str,
    external_message_id: str,
) -> bool:
    dedup_key = f"{platform_id}:{binding_id}:{external_message_id}"
    try:
        with get_connection() as connection:
            connection.execute(
                """
                INSERT INTO message_platform_dedup (dedup_key, platform_id, binding_id, external_message_id)
                VALUES (?, ?, ?, ?)
                """,
                (dedup_key, platform_id, binding_id, external_message_id),
            )
            connection.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def append_audit_event(
    *,
    binding_id: str = "",
    platform_id: str = "",
    platform_session_id: str = "",
    event_type: str,
    severity: str = "info",
    message: str = "",
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event_id = f"mpe_{uuid4().hex[:12]}"
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO message_platform_audit_events (
                event_id,
                binding_id,
                platform_id,
                platform_session_id,
                event_type,
                severity,
                message,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                binding_id,
                platform_id,
                platform_session_id,
                event_type,
                severity,
                message,
                _json_dumps(payload or {}),
            ),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM message_platform_audit_events WHERE event_id = ?",
            (event_id,),
        ).fetchone()
    return _row_to_audit_event(row)


def list_audit_events(
    *,
    binding_id: str = "",
    platform_session_id: str = "",
    limit: int = 50,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if binding_id:
        clauses.append("binding_id = ?")
        params.append(binding_id)
    if platform_session_id:
        clauses.append("platform_session_id = ?")
        params.append(platform_session_id)
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM message_platform_audit_events
            {where_clause}
            ORDER BY created_at DESC, event_id DESC
            LIMIT ?
            """,
            [*params, max(1, min(int(limit or 50), 200))],
        ).fetchall()
    return [_row_to_audit_event(row) for row in rows]

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
from typing import Any, Iterator
from uuid import uuid4

from app.buddy.home import (
    AGENTS_PATH,
    CAPABILITY_USAGE_STATS_KEY,
    DEFAULT_CAPABILITY_USAGE_STATS,
    DEFAULT_BUDDY_IDENTITY,
    DEFAULT_SESSION_SUMMARY,
    MEMORY_PATH,
    SOUL_PATH,
    USER_PATH,
    ensure_buddy_home,
    get_default_buddy_home_dir,
    open_buddy_database,
    read_buddy_identity_markdown,
    render_buddy_identity_markdown,
)
from app.core.storage.json_file_utils import utc_now_iso


BUDDY_HOME_DIR = get_default_buddy_home_dir()
DEFAULT_CHAT_SESSION_TITLE = "新的对话"
MAX_CHAT_SESSION_TITLE_CHARS = 32
MAX_CHAT_MESSAGE_PREVIEW_CHARS = 96
DEFAULT_RECALL_BOOKEND = 3
DEFAULT_RECALL_WINDOW = 5
MAX_RECALL_LIMIT = 50
MAX_RECALL_WINDOW = 20
MAX_RUN_CONTEXT_SEARCH_LIMIT = 100
MAX_MEMORY_SEARCH_LIMIT = 50
MAX_BUDDY_HOME_FILE_CONTENT_CHARS = 200_000
HIDDEN_SESSION_SOURCES = {"tool"}
BACKGROUND_REVIEW_STATUSES = {"queued", "running", "paused", "awaiting_human", "completed", "failed", "cancelled", "skipped"}
IMPROVEMENT_CANDIDATE_STATUSES = {
    "proposed",
    "validating",
    "validated",
    "needs_changes",
    "waiting_for_approval",
    "approved",
    "rejected",
    "applied",
    "failed",
    "superseded",
}
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
REQUIRED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES: set[str] = set()
DEFAULT_RUN_TEMPLATE_BINDING = {
    "version": RUN_TEMPLATE_BINDING_VERSION,
    "template_id": "buddy_autonomous_loop",
    "input_bindings": {
        "input_user_message": "current_message",
    },
}
DEFAULT_MEMORY_REVIEW_TEMPLATE_BINDING = {
    "version": MEMORY_REVIEW_TEMPLATE_BINDING_VERSION,
    "template_id": "buddy_autonomous_review",
    "input_bindings": {},
}


def initialize_buddy_home() -> None:
    ensure_buddy_home(BUDDY_HOME_DIR)


def load_buddy_identity() -> dict[str, Any]:
    initialize_buddy_home()
    return read_buddy_identity_markdown(BUDDY_HOME_DIR / SOUL_PATH)


def save_buddy_identity(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_buddy_identity()
    cleaned = _clean_dict(payload)
    next_value = {
        **previous,
        **cleaned,
        "display_preferences": _merged_display_preferences(previous, cleaned),
    }
    _write_with_revision("buddy_identity", "buddy_identity", "update", previous, next_value, changed_by, change_reason)
    (BUDDY_HOME_DIR / SOUL_PATH).write_text(render_buddy_identity_markdown(next_value), encoding="utf-8")
    return load_buddy_identity()


def load_memory_document() -> dict[str, Any]:
    initialize_buddy_home()
    path = BUDDY_HOME_DIR / MEMORY_PATH
    return {
        "path": MEMORY_PATH,
        "content": path.read_text(encoding="utf-8"),
        "updated_at": "",
    }


def load_user_context_document() -> dict[str, Any]:
    initialize_buddy_home()
    path = BUDDY_HOME_DIR / USER_PATH
    return {
        "path": USER_PATH,
        "content": path.read_text(encoding="utf-8"),
        "updated_at": "",
    }


def save_user_context_document(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_user_context_document()
    content = str(payload.get("content") or "")
    if not content.strip():
        raise ValueError("USER.md content cannot be empty.")
    next_value = {
        "path": USER_PATH,
        "content": content,
        "updated_at": utc_now_iso(),
    }
    _write_with_revision("home_file", USER_PATH, "update", previous, next_value, changed_by, change_reason)
    (BUDDY_HOME_DIR / USER_PATH).write_text(content, encoding="utf-8")
    return load_user_context_document()


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
    revision = _write_with_revision("session_summary", "session_summary", "update", previous, next_value, changed_by, change_reason)
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
    _save_chat_session_summary_if_requested(payload, next_value, revision_id=str(revision.get("revision_id") or ""))
    return load_session_summary()


def _save_chat_session_summary_if_requested(
    payload: dict[str, Any],
    summary: dict[str, Any],
    *,
    revision_id: str,
) -> None:
    session_id = str(payload.get("session_id") or "").strip()
    if not session_id:
        return
    session = get_chat_session(session_id)
    content = str(summary.get("content") or "").strip()
    if not content:
        return
    now = str(summary.get("updated_at") or utc_now_iso())
    lineage_root_session_id = _resolve_session_lineage_root(session_id) or session_id
    summary_id = str(payload.get("summary_id") or "").strip() or f"summary_{uuid4().hex[:12]}"
    source_refs = _normalize_summary_source_refs(payload.get("source_refs"))
    source_run_id = str(payload.get("source_run_id") or "").strip()
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_session_summaries (
                summary_id,
                session_id,
                lineage_root_session_id,
                content,
                source_refs_json,
                source_run_id,
                source_revision_id,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(summary_id) DO UPDATE SET
                session_id = excluded.session_id,
                lineage_root_session_id = excluded.lineage_root_session_id,
                content = excluded.content,
                source_refs_json = excluded.source_refs_json,
                source_run_id = excluded.source_run_id,
                source_revision_id = excluded.source_revision_id,
                updated_at = excluded.updated_at
            """,
            (
                summary_id,
                session_id,
                lineage_root_session_id,
                content,
                _json_dumps(source_refs),
                source_run_id,
                revision_id,
                now,
                now,
            ),
        )
        connection.commit()
    _project_chat_session_summary_to_retrieval(
        summary_id=summary_id,
        session_id=session_id,
        session_title=str(session.get("title") or ""),
        lineage_root_session_id=lineage_root_session_id,
        content=content,
        source_refs=source_refs,
        source_run_id=source_run_id,
        source_revision_id=revision_id,
        embedding_model_refs=_embedding_model_refs_from_payload(payload),
        updated_at=now,
    )


def _project_chat_session_summary_to_retrieval(
    *,
    summary_id: str,
    session_id: str,
    session_title: str,
    lineage_root_session_id: str,
    content: str,
    source_refs: list[dict[str, Any]],
    source_run_id: str,
    source_revision_id: str,
    embedding_model_refs: list[str],
    updated_at: str,
) -> None:
    from app.core.storage.embedding_store import queue_embedding_job
    from app.core.storage.retrieval_store import upsert_retrieval_chunks, upsert_retrieval_document

    document = upsert_retrieval_document(
        source_kind="buddy_session_summary",
        source_id=summary_id,
        source_revision_id=source_revision_id,
        title=f"Session summary: {session_title or session_id}",
        content=content,
        scope={
            "session_id": session_id,
            "lineage_root_session_id": lineage_root_session_id,
        },
        metadata={
            "role": "buddy_session_summary",
            "session_id": session_id,
            "lineage_root_session_id": lineage_root_session_id,
            "source_run_id": source_run_id,
            "summary_id": summary_id,
            "updated_at": updated_at,
        },
        document_id=f"buddy_session_summary:{summary_id}",
    )
    upsert_retrieval_chunks(
        document["document_id"],
        [
            {
                "chunk_id": f"buddy_session_summary:{summary_id}:body",
                "content": content,
                "source_locator": {
                    "summary_id": summary_id,
                    "session_id": session_id,
                    "lineage_root_session_id": lineage_root_session_id,
                    "source_run_id": source_run_id,
                    "source_revision_id": source_revision_id,
                    "source_refs": deepcopy(source_refs),
                },
                "metadata": {
                    "role": "buddy_session_summary",
                    "session_id": session_id,
                    "lineage_root_session_id": lineage_root_session_id,
                    "source_run_id": source_run_id,
                    "summary_id": summary_id,
                    "source_ref_count": len(source_refs),
                    "content_hash": _sha256_text(content),
                },
            }
        ],
    )
    for model_ref in embedding_model_refs:
        queue_embedding_job("buddy_session_summary", summary_id, model_ref)


def _normalize_embedding_model_refs(value: Any) -> list[str]:
    if isinstance(value, str):
        raw_items = value.replace("\n", ",").split(",")
    elif isinstance(value, list):
        raw_items = value
    else:
        raw_items = []
    refs: list[str] = []
    for item in raw_items:
        text = str(item or "").strip()
        if text and text not in refs:
            refs.append(text)
    return refs


def _embedding_model_refs_from_payload(payload: dict[str, Any]) -> list[str]:
    if "embedding_model_refs" in payload:
        return _normalize_embedding_model_refs(payload.get("embedding_model_refs"))
    from app.core.storage.embedding_model_sync import get_default_embedding_model_refs_from_settings

    return get_default_embedding_model_refs_from_settings()


def _sha256_text(value: str) -> str:
    return f"sha256:{hashlib.sha256(str(value or '').encode('utf-8')).hexdigest()}"


def _normalize_summary_source_refs(value: Any) -> list[dict[str, Any]]:
    refs = value if isinstance(value, list) else []
    normalized: list[dict[str, Any]] = []
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        source_kind = str(ref.get("source_kind") or "").strip()
        source_id = str(ref.get("source_id") or "").strip()
        if not source_kind or not source_id:
            continue
        normalized.append(
            {
                **{str(key): deepcopy(item) for key, item in ref.items()},
                "source_kind": source_kind,
                "source_id": source_id,
            }
        )
    return normalized


def list_home_files() -> dict[str, Any]:
    initialize_buddy_home()
    files = [
        _home_file_entry(BUDDY_HOME_DIR / AGENTS_PATH, AGENTS_PATH),
        _home_file_entry(BUDDY_HOME_DIR / SOUL_PATH, SOUL_PATH),
        _home_file_entry(BUDDY_HOME_DIR / USER_PATH, USER_PATH),
        _home_file_entry(BUDDY_HOME_DIR / MEMORY_PATH, MEMORY_PATH),
    ]
    return {"root": str(BUDDY_HOME_DIR), "files": files}


def load_capability_usage_stats() -> dict[str, Any]:
    return _with_runtime_capability_usage_events(_load_capability_usage_stats_from_kv())


def _load_capability_usage_stats_from_kv() -> dict[str, Any]:
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
    previous = _load_capability_usage_stats_from_kv()
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
    try:
        binding = _normalize_memory_review_template_binding(value)
        if _memory_review_template_binding_needs_repair(value, binding):
            return _with_memory_review_template_binding_repair_metadata(
                binding,
                reason="normalized_saved_binding",
                previous_value=value,
            )
        return binding
    except Exception as exc:
        binding = _normalize_memory_review_template_binding(DEFAULT_MEMORY_REVIEW_TEMPLATE_BINDING)
        return _with_memory_review_template_binding_repair_metadata(
            binding,
            reason="invalid_saved_binding",
            previous_value=value,
            error=str(exc),
        )


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


def create_background_review_run(
    *,
    source_run_id: str,
    review_run_id: str,
    template_id: str,
    trigger_reason: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_source_run_id = str(source_run_id or "").strip()
    normalized_review_run_id = str(review_run_id or "").strip()
    normalized_template_id = str(template_id or "").strip()
    normalized_trigger_reason = str(trigger_reason or "").strip() or "visible_buddy_run_completed"
    if not normalized_source_run_id:
        raise ValueError("source_run_id is required.")
    if not normalized_review_run_id:
        raise ValueError("review_run_id is required.")
    if not normalized_template_id:
        raise ValueError("template_id is required.")
    now = utc_now_iso()
    review_id = f"bgrev_{uuid4().hex[:12]}"
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO buddy_background_review_runs (
                review_id,
                source_run_id,
                review_run_id,
                template_id,
                status,
                trigger_reason,
                metadata_json,
                error,
                created_at,
                updated_at,
                started_at,
                completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                review_id,
                normalized_source_run_id,
                normalized_review_run_id,
                normalized_template_id,
                "queued",
                normalized_trigger_reason,
                _json_dumps(metadata or {}),
                "",
                now,
                now,
                None,
                None,
            ),
        )
        connection.commit()
    return get_background_review_run(review_id)


def get_background_review_run(review_id: str) -> dict[str, Any]:
    normalized_review_id = str(review_id or "").strip()
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT review_id, source_run_id, review_run_id, template_id, status, trigger_reason,
                   metadata_json, error, created_at, updated_at, started_at, completed_at
            FROM buddy_background_review_runs
            WHERE review_id = ?
            """,
            (normalized_review_id,),
        ).fetchone()
    if not row:
        raise KeyError(normalized_review_id)
    return _background_review_from_row(row)


def get_background_review_run_by_review_run_id(review_run_id: str) -> dict[str, Any]:
    normalized_review_run_id = str(review_run_id or "").strip()
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT review_id, source_run_id, review_run_id, template_id, status, trigger_reason,
                   metadata_json, error, created_at, updated_at, started_at, completed_at
            FROM buddy_background_review_runs
            WHERE review_run_id = ?
            ORDER BY created_at DESC, review_id DESC
            LIMIT 1
            """,
            (normalized_review_run_id,),
        ).fetchone()
    if not row:
        raise KeyError(normalized_review_run_id)
    return _background_review_from_row(row)


def list_background_review_runs(*, source_run_id: str | None = None) -> list[dict[str, Any]]:
    normalized_source_run_id = str(source_run_id or "").strip()
    query = """
        SELECT review_id, source_run_id, review_run_id, template_id, status, trigger_reason,
               metadata_json, error, created_at, updated_at, started_at, completed_at
        FROM buddy_background_review_runs
    """
    params: list[Any] = []
    if normalized_source_run_id:
        query += " WHERE source_run_id = ?"
        params.append(normalized_source_run_id)
    query += " ORDER BY created_at DESC, review_id DESC"
    with _connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [_background_review_from_row(row) for row in rows]


def mark_background_review_run_started(review_id: str, *, review_run_id: str | None = None) -> dict[str, Any]:
    normalized_review_id = str(review_id or "").strip()
    normalized_review_run_id = str(review_run_id or "").strip()
    now = utc_now_iso()
    with _connection() as connection:
        if normalized_review_run_id:
            connection.execute(
                """
                UPDATE buddy_background_review_runs
                SET status = ?, review_run_id = ?, started_at = COALESCE(started_at, ?), updated_at = ?
                WHERE review_id = ?
                """,
                ("running", normalized_review_run_id, now, now, normalized_review_id),
            )
        else:
            connection.execute(
                """
                UPDATE buddy_background_review_runs
                SET status = ?, started_at = COALESCE(started_at, ?), updated_at = ?
                WHERE review_id = ?
                """,
                ("running", now, now, normalized_review_id),
            )
        connection.commit()
    return get_background_review_run(normalized_review_id)


def mark_background_review_run_finished(review_id: str, *, status: str, error: str = "") -> dict[str, Any]:
    normalized_review_id = str(review_id or "").strip()
    normalized_status = str(status or "").strip().lower()
    if normalized_status not in BACKGROUND_REVIEW_STATUSES:
        raise ValueError(f"Unsupported background review status: {status}")
    now = utc_now_iso()
    completed_at = now if normalized_status in {"completed", "failed", "cancelled", "skipped"} else None
    with _connection() as connection:
        connection.execute(
            """
            UPDATE buddy_background_review_runs
            SET status = ?, error = ?, completed_at = COALESCE(?, completed_at), updated_at = ?
            WHERE review_id = ?
            """,
            (normalized_status, str(error or ""), completed_at, now, normalized_review_id),
        )
        connection.commit()
    return get_background_review_run(normalized_review_id)


def upsert_improvement_candidates_for_review(
    review_record: dict[str, Any],
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    review_id = str(review_record.get("review_id") or "").strip()
    source_run_id = str(review_record.get("source_run_id") or "").strip()
    review_run_id = str(review_record.get("review_run_id") or "").strip()
    if not review_id or not isinstance(candidates, list):
        return []
    now = utc_now_iso()
    rows: list[tuple[Any, ...]] = []
    candidate_ids: list[str] = []
    for index, item in enumerate(candidates):
        if not isinstance(item, dict):
            continue
        candidate_id = _normalize_improvement_candidate_id(item.get("candidate_id"))
        if not candidate_id:
            candidate_id = f"{review_run_id or review_id}_candidate_{index + 1}"
        item_source_run_id = _normalize_improvement_candidate_id(item.get("source_run_id")) or source_run_id
        target_ref = item.get("target_ref") if isinstance(item.get("target_ref"), dict) else {}
        evidence_refs = item.get("evidence_refs") if isinstance(item.get("evidence_refs"), list) else []
        status = _normalize_improvement_candidate_status(item.get("status")) or "proposed"
        approval_required = item.get("approval_required")
        approval_required_bool = True if approval_required is None else bool(approval_required)
        rows.append(
            (
                candidate_id,
                _normalize_improvement_candidate_text(item.get("kind")),
                status,
                item_source_run_id,
                review_id,
                review_run_id,
                _json_dumps(target_ref),
                _json_dumps(evidence_refs),
                _normalize_improvement_candidate_text(item.get("risk_level")),
                _normalize_improvement_candidate_text(item.get("expected_benefit")),
                _normalize_improvement_candidate_text(
                    item.get("proposed_change_summary") or item.get("summary") or item.get("title")
                ),
                int(approval_required_bool),
                _json_dumps(item),
                now,
                now,
            )
        )
        candidate_ids.append(candidate_id)
    if not rows:
        return []
    with _connection() as connection:
        connection.executemany(
            """
            INSERT INTO improvement_candidates (
                candidate_id,
                kind,
                status,
                source_run_id,
                review_id,
                review_run_id,
                target_ref_json,
                evidence_refs_json,
                risk_level,
                expected_benefit,
                proposed_change_summary,
                approval_required,
                payload_json,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(candidate_id) DO UPDATE SET
                kind = excluded.kind,
                source_run_id = excluded.source_run_id,
                review_id = excluded.review_id,
                review_run_id = excluded.review_run_id,
                target_ref_json = excluded.target_ref_json,
                evidence_refs_json = excluded.evidence_refs_json,
                risk_level = excluded.risk_level,
                expected_benefit = excluded.expected_benefit,
                proposed_change_summary = excluded.proposed_change_summary,
                approval_required = excluded.approval_required,
                payload_json = excluded.payload_json,
                updated_at = improvement_candidates.updated_at
            """,
            rows,
        )
        connection.commit()
    return list_improvement_candidates(candidate_ids=candidate_ids)


def list_improvement_candidates(
    *,
    source_run_id: str | None = None,
    review_id: str | None = None,
    review_run_id: str | None = None,
    validation_run_id: str | None = None,
    status: str | None = None,
    candidate_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    query = """
        SELECT candidate_id, kind, status, status_reason, source_run_id, review_id, review_run_id,
               target_ref_json, evidence_refs_json, risk_level, expected_benefit,
               proposed_change_summary, approval_required, validation_run_id,
               validation_result_json, applied_revision_id, applied_command_json,
               applied_at, decision_json, decided_at, payload_json, created_at, updated_at
        FROM improvement_candidates
    """
    clauses: list[str] = []
    params: list[Any] = []
    normalized_candidate_ids: list[str] = []
    for candidate_id in candidate_ids or []:
        normalized_candidate_id = _normalize_improvement_candidate_id(candidate_id)
        if normalized_candidate_id:
            normalized_candidate_ids.append(normalized_candidate_id)
    if normalized_candidate_ids:
        placeholders = ", ".join("?" for _ in normalized_candidate_ids)
        clauses.append(f"candidate_id IN ({placeholders})")
        params.extend(normalized_candidate_ids)
    normalized_source_run_id = str(source_run_id or "").strip()
    if normalized_source_run_id:
        clauses.append("source_run_id = ?")
        params.append(normalized_source_run_id)
    normalized_review_id = str(review_id or "").strip()
    if normalized_review_id:
        clauses.append("review_id = ?")
        params.append(normalized_review_id)
    normalized_review_run_id = str(review_run_id or "").strip()
    if normalized_review_run_id:
        clauses.append("review_run_id = ?")
        params.append(normalized_review_run_id)
    normalized_validation_run_id = str(validation_run_id or "").strip()
    if normalized_validation_run_id:
        clauses.append("validation_run_id = ?")
        params.append(normalized_validation_run_id)
    requested_status = str(status or "").strip()
    normalized_status = _normalize_improvement_candidate_status(status)
    if requested_status and not normalized_status:
        return []
    if normalized_status:
        clauses.append("status = ?")
        params.append(normalized_status)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY updated_at DESC, created_at DESC, candidate_id DESC"
    with _connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [_improvement_candidate_from_row(row) for row in rows]


def get_improvement_candidate(candidate_id: str) -> dict[str, Any]:
    normalized_candidate_id = _normalize_improvement_candidate_id(candidate_id)
    if not normalized_candidate_id:
        raise KeyError(candidate_id)
    with _connection() as connection:
        row = connection.execute(
            """
            SELECT candidate_id, kind, status, status_reason, source_run_id, review_id, review_run_id,
                   target_ref_json, evidence_refs_json, risk_level, expected_benefit,
                   proposed_change_summary, approval_required, validation_run_id,
                   validation_result_json, applied_revision_id, applied_command_json,
                   applied_at, decision_json, decided_at, payload_json, created_at, updated_at
            FROM improvement_candidates
            WHERE candidate_id = ?
            """,
            (normalized_candidate_id,),
        ).fetchone()
    if not row:
        raise KeyError(normalized_candidate_id)
    return _improvement_candidate_from_row(row)


def link_improvement_candidate_validation_run(candidate_id: str, validation_run_id: str) -> dict[str, Any]:
    normalized_candidate_id = _normalize_improvement_candidate_id(candidate_id)
    normalized_validation_run_id = str(validation_run_id or "").strip()
    if not normalized_candidate_id:
        raise ValueError("candidate_id is required.")
    if not normalized_validation_run_id:
        raise ValueError("validation_run_id is required.")
    now = utc_now_iso()
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE improvement_candidates
            SET status = ?, validation_run_id = ?, updated_at = ?
            WHERE candidate_id = ?
            """,
            ("validating", normalized_validation_run_id, now, normalized_candidate_id),
        )
        connection.commit()
    if cursor.rowcount <= 0:
        raise KeyError(normalized_candidate_id)
    return get_improvement_candidate(normalized_candidate_id)


def update_improvement_candidate_status(
    candidate_id: str,
    status: str,
    *,
    status_reason: str = "",
    validation_result: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_candidate_id = _normalize_improvement_candidate_id(candidate_id)
    normalized_status = _normalize_improvement_candidate_status(status)
    if not normalized_candidate_id:
        raise ValueError("candidate_id is required.")
    if not normalized_status:
        raise ValueError(f"Unsupported improvement candidate status: {status}")
    now = utc_now_iso()
    validation_result_json = _json_dumps(validation_result) if validation_result is not None else None
    normalized_status_reason = str(status_reason or "").strip()
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE improvement_candidates
            SET status = ?,
                status_reason = CASE WHEN ? != '' THEN ? ELSE status_reason END,
                validation_result_json = COALESCE(?, validation_result_json),
                updated_at = ?
            WHERE candidate_id = ?
            """,
            (
                normalized_status,
                normalized_status_reason,
                normalized_status_reason,
                validation_result_json,
                now,
                normalized_candidate_id,
            ),
        )
        connection.commit()
    if cursor.rowcount <= 0:
        raise KeyError(normalized_candidate_id)
    return get_improvement_candidate(normalized_candidate_id)


def decide_improvement_candidate(candidate_id: str, *, decision: str, reason: str = "") -> dict[str, Any]:
    normalized_candidate_id = _normalize_improvement_candidate_id(candidate_id)
    normalized_decision = str(decision or "").strip().lower()
    if not normalized_candidate_id:
        raise ValueError("candidate_id is required.")
    if normalized_decision not in {"approve", "reject"}:
        raise ValueError(f"Unsupported improvement candidate decision: {decision}")
    candidate = get_improvement_candidate(normalized_candidate_id)
    previous_status = str(candidate.get("status") or "").strip()
    if normalized_decision == "approve" and previous_status not in {"validated", "waiting_for_approval"}:
        raise ValueError("Only validated or waiting_for_approval candidates can be approved.")
    if previous_status in {"applied", "superseded"}:
        raise ValueError(f"Candidate status '{previous_status}' cannot be changed by decision.")
    now = utc_now_iso()
    next_status = "approved" if normalized_decision == "approve" else "rejected"
    normalized_reason = str(reason or "").strip()
    decision_payload = {
        "decision": normalized_decision,
        "reason": normalized_reason,
        "previous_status": previous_status,
        "decided_at": now,
    }
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE improvement_candidates
            SET status = ?,
                status_reason = ?,
                decision_json = ?,
                decided_at = ?,
                updated_at = ?
            WHERE candidate_id = ?
            """,
            (
                next_status,
                normalized_reason,
                _json_dumps(decision_payload),
                now,
                now,
                normalized_candidate_id,
            ),
        )
        connection.commit()
    if cursor.rowcount <= 0:
        raise KeyError(normalized_candidate_id)
    return get_improvement_candidate(normalized_candidate_id)


def mark_improvement_candidate_applied(
    candidate_id: str,
    *,
    revision_id: str,
    applied_command: dict[str, Any],
    status_reason: str = "",
) -> dict[str, Any]:
    normalized_candidate_id = _normalize_improvement_candidate_id(candidate_id)
    normalized_revision_id = str(revision_id or "").strip()
    if not normalized_candidate_id:
        raise ValueError("candidate_id is required.")
    if not normalized_revision_id:
        raise ValueError("revision_id is required.")
    now = utc_now_iso()
    normalized_status_reason = str(status_reason or "").strip()
    with _connection() as connection:
        cursor = connection.execute(
            """
            UPDATE improvement_candidates
            SET status = ?,
                status_reason = CASE WHEN ? != '' THEN ? ELSE status_reason END,
                applied_revision_id = ?,
                applied_command_json = ?,
                applied_at = ?,
                updated_at = ?
            WHERE candidate_id = ?
            """,
            (
                "applied",
                normalized_status_reason,
                normalized_status_reason,
                normalized_revision_id,
                _json_dumps(applied_command),
                now,
                now,
                normalized_candidate_id,
            ),
        )
        connection.commit()
    if cursor.rowcount <= 0:
        raise KeyError(normalized_candidate_id)
    return get_improvement_candidate(normalized_candidate_id)


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
    requested_session_id = _normalize_optional_text((payload or {}).get("session_id"))
    title = _normalize_chat_session_title((payload or {}).get("title"))
    parent_session_id = _normalize_optional_text((payload or {}).get("parent_session_id"))
    source = _normalize_session_source((payload or {}).get("source"))
    session = {
        "session_id": requested_session_id or f"session_{uuid4().hex[:12]}",
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
    embedding_model_ref: str = "",
    reranker_model_ref: str = "",
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
            embedding_model_ref=str(embedding_model_ref or "").strip(),
            reranker_model_ref=str(reranker_model_ref or "").strip(),
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


def search_chat_sessions(
    *,
    query: str = "",
    current_session_id: str | None = None,
    embedding_model_ref: str = "",
    limit: int = 10,
    window: int = DEFAULT_RECALL_WINDOW,
    role_filter: Any = None,
    sort: str | None = None,
    reranker_model_ref: str = "",
) -> dict[str, Any]:
    recall = recall_chat_messages(
        mode="discover" if str(query or "").strip() else "browse",
        query=query,
        limit=limit,
        window=window,
        role_filter=role_filter,
        sort=sort,
        current_session_id=current_session_id,
        embedding_model_ref=embedding_model_ref,
        reranker_model_ref=reranker_model_ref,
    )
    sessions = list(recall.get("sessions") or [])
    message_ids: list[str] = []
    for session in sessions:
        for message_id in session.get("hit_message_ids") or []:
            normalized_message_id = str(message_id or "").strip()
            if normalized_message_id and normalized_message_id not in message_ids:
                message_ids.append(normalized_message_id)
        for message in session.get("messages") or []:
            normalized_message_id = str((message or {}).get("message_id") or "").strip()
            if normalized_message_id and normalized_message_id not in message_ids:
                message_ids.append(normalized_message_id)
    return {
        "kind": "buddy_session_search",
        "query": str(recall.get("query") or query or ""),
        "embedding_model_ref": str(embedding_model_ref or "").strip(),
        "reranker_model_ref": str(reranker_model_ref or "").strip(),
        "hit_count": int(recall.get("hit_count") or 0),
        "session_count": int(recall.get("session_count") or len(sessions)),
        "message_ids": message_ids,
        "sessions": sessions,
        "report": _session_search_report(
            recall,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
        ),
    }


def _session_search_report(
    recall: dict[str, Any],
    *,
    embedding_model_ref: str = "",
    reranker_model_ref: str = "",
) -> dict[str, Any]:
    from app.core.storage.retrieval_store import load_retrieval_ranking_reports

    mode = str(recall.get("retrieval_mode") or "").strip()
    normalized_embedding_model_ref = str(embedding_model_ref or recall.get("embedding_model_ref") or "").strip()
    normalized_reranker_model_ref = str(reranker_model_ref or recall.get("reranker_model_ref") or "").strip()
    retrieval_modes: dict[str, int] = {}
    query_ids: list[str] = []
    for session in list(recall.get("sessions") or []):
        retrieval = _coerce_dict((session or {}).get("retrieval"))
        retrieval_mode = str(retrieval.get("mode") or "").strip()
        if retrieval_mode:
            retrieval_modes[retrieval_mode] = retrieval_modes.get(retrieval_mode, 0) + 1
        query_id = str(retrieval.get("query_id") or "").strip()
        if query_id and query_id not in query_ids:
            query_ids.append(query_id)
    return {
        "mode": mode or ("hybrid" if normalized_embedding_model_ref else "keyword" if str(recall.get("query") or "").strip() else "browse"),
        "embedding_model_ref": normalized_embedding_model_ref,
        "reranker_model_ref": normalized_reranker_model_ref,
        "retrieval_modes": retrieval_modes,
        "query_ids": query_ids,
        "ranking_reports": load_retrieval_ranking_reports(query_ids),
    }


def search_run_context(run_id: str, *, query: str = "", limit: int = 25) -> dict[str, Any]:
    from app.core.storage.context_assembly_store import (
        expand_context_assembly_ref,
        expand_context_package,
        is_context_assembly_ref,
        is_context_package,
    )
    from app.core.storage.run_store import load_run

    normalized_run_id = str(run_id or "").strip()
    if not normalized_run_id:
        raise KeyError(normalized_run_id)
    run = load_run(normalized_run_id)
    normalized_query = str(query or "").strip()
    normalized_limit = _bounded_int(limit, default=25, minimum=1, maximum=MAX_RUN_CONTEXT_SEARCH_LIMIT)
    matches: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str, str, str]] = set()

    def append_match(
        *,
        state_key: str,
        node_id: str = "",
        output_key: str = "",
        package: dict[str, Any] | None = None,
        assembly: dict[str, Any] | None = None,
        text: str = "",
        source: dict[str, Any] | None = None,
        warnings: list[Any] | None = None,
    ) -> None:
        nonlocal matches
        if len(matches) >= normalized_limit:
            return
        assembly = assembly or {}
        package = package or {}
        source = source or {}
        searchable_text = "\n".join(
            [
                str(text or ""),
                str(source.get("label") or ""),
                str(source.get("source_kind") or ""),
                str(source.get("source_id") or ""),
                _json_dumps(source.get("metadata") or {}),
            ]
        )
        if normalized_query and normalized_query.lower() not in searchable_text.lower():
            return
        key = (
            state_key,
            str(assembly.get("assembly_id") or ""),
            str(source.get("source_kind") or ""),
            str(source.get("source_id") or ""),
            str(source.get("source_revision_id") or ""),
            str(source.get("label") or ""),
        )
        if key in seen:
            return
        seen.add(key)
        matches.append(
            {
                "run_id": normalized_run_id,
                "state_key": state_key,
                "node_id": node_id,
                "output_key": output_key,
                "package_kind": str(package.get("kind") or ""),
                "package_source_kind": str(package.get("source_kind") or ""),
                "authority": str(package.get("authority") or _coerce_dict(source.get("metadata")).get("authority") or ""),
                "assembly_id": str(assembly.get("assembly_id") or ""),
                "target_state_key": str(assembly.get("target_state_key") or ""),
                "renderer_key": str(assembly.get("renderer_key") or ""),
                "renderer_version": str(assembly.get("renderer_version") or ""),
                "source_kind": str(source.get("source_kind") or ""),
                "source_id": str(source.get("source_id") or ""),
                "source_revision_id": str(source.get("source_revision_id") or ""),
                "role": str(source.get("role") or ""),
                "label": str(source.get("label") or ""),
                "metadata": _coerce_dict(source.get("metadata")),
                "snippet": _make_text_snippet(searchable_text, tokens=[normalized_query] if normalized_query else []),
                "warnings": list(warnings or []),
            }
        )

    for context_value in _iter_run_context_values(run):
        state_key = context_value["state_key"]
        value = context_value["value"]
        node_id = context_value["node_id"]
        output_key = context_value["output_key"]
        try:
            if is_context_package(value):
                expanded = expand_context_package(value)
                assembly = expanded.get("assembly") if isinstance(expanded.get("assembly"), dict) else {}
                sources = list(assembly.get("sources") or [])
                if sources:
                    for source in sources:
                        append_match(
                            state_key=state_key,
                            node_id=node_id,
                            output_key=output_key,
                            package=value,
                            assembly=assembly,
                            text=str(expanded.get("text") or ""),
                            source=source if isinstance(source, dict) else {},
                            warnings=list(expanded.get("warnings") or []),
                        )
                else:
                    append_match(
                        state_key=state_key,
                        node_id=node_id,
                        output_key=output_key,
                        package=value,
                        assembly=assembly,
                        text=str(expanded.get("text") or ""),
                        source={
                            "source_kind": str(value.get("source_kind") or "context_package"),
                            "source_id": str(value.get("id") or state_key),
                            "label": str(value.get("title") or state_key),
                            "metadata": {"authority": value.get("authority")},
                        },
                        warnings=list(expanded.get("warnings") or []),
                    )
            elif is_context_assembly_ref(value):
                expanded = expand_context_assembly_ref(value)
                assembly = expanded.get("assembly") if isinstance(expanded.get("assembly"), dict) else {}
                for source in list(assembly.get("sources") or []):
                    append_match(
                        state_key=state_key,
                        node_id=node_id,
                        output_key=output_key,
                        assembly=assembly,
                        text=str(expanded.get("text") or ""),
                        source=source if isinstance(source, dict) else {},
                        warnings=list(expanded.get("warnings") or []),
                    )
        except Exception as exc:
            append_match(
                state_key=state_key,
                node_id=node_id,
                output_key=output_key,
                text=str(value),
                source={
                    "source_kind": "context_resolution_error",
                    "source_id": state_key,
                    "label": state_key,
                    "metadata": {"error": str(exc)},
                },
                warnings=[{"code": "context_resolution_error", "message": str(exc)}],
            )

    return {
        "kind": "run_context_search",
        "run_id": normalized_run_id,
        "query": normalized_query,
        "match_count": len(matches),
        "matches": matches,
    }


def search_memories(
    *,
    query: str = "",
    embedding_model_ref: str = "",
    reranker_model_ref: str = "",
    scope_kind: str = "",
    scope_id: str = "",
    layer: str = "",
    memory_type: str = "",
    status: str = "active",
    limit: int = 10,
) -> dict[str, Any]:
    from app.core.storage.embedding_store import list_embedding_models
    from app.core.storage.memory_store import recall_memories
    from app.core.storage.retrieval_store import load_retrieval_ranking_reports

    normalized_query = str(query or "").strip()
    normalized_embedding_model_ref = str(embedding_model_ref or "").strip()
    normalized_reranker_model_ref = str(reranker_model_ref or "").strip()
    normalized_limit = _bounded_int(limit, default=10, minimum=1, maximum=MAX_MEMORY_SEARCH_LIMIT)
    filters = {
        key: value
        for key, value in {
            "scope_kind": str(scope_kind or "").strip(),
            "scope_id": str(scope_id or "").strip(),
            "layer": str(layer or "").strip(),
            "memory_type": str(memory_type or "").strip(),
            "status": str(status or "active").strip(),
            "embedding_model_ref": normalized_embedding_model_ref,
            "reranker_model_ref": normalized_reranker_model_ref,
        }.items()
        if value
    }
    memories = recall_memories(normalized_query, filters=filters, limit=normalized_limit)
    embedding_models = list_embedding_models(enabled_only=False)
    retrieval_modes: dict[str, int] = {}
    query_ids: list[str] = []
    for memory in memories:
        retrieval = _coerce_dict(memory.get("retrieval"))
        mode = str(retrieval.get("mode") or "browse")
        retrieval_modes[mode] = retrieval_modes.get(mode, 0) + 1
        query_id = str(retrieval.get("query_id") or "").strip()
        if query_id and query_id not in query_ids:
            query_ids.append(query_id)
    return {
        "kind": "memory_search",
        "query": normalized_query,
        "embedding_model_ref": normalized_embedding_model_ref,
        "reranker_model_ref": normalized_reranker_model_ref,
        "match_count": len(memories),
        "memory_count": len(memories),
        "embedding_models": embedding_models,
        "memories": memories,
        "report": {
            "mode": "hybrid" if normalized_embedding_model_ref else ("keyword" if normalized_query else "browse"),
            "filters": {key: value for key, value in filters.items() if key not in {"embedding_model_ref", "reranker_model_ref"}},
            "embedding_model_ref": normalized_embedding_model_ref,
            "reranker_model_ref": normalized_reranker_model_ref,
            "retrieval_modes": retrieval_modes,
            "query_ids": query_ids,
            "ranking_reports": load_retrieval_ranking_reports(query_ids),
        },
    }


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
    metadata = _sanitize_chat_message_metadata(payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {})
    if not content.strip():
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
    message_revision_id = f"msgrev_{uuid4().hex[:12]}"
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
        connection.execute(
            """
            INSERT INTO buddy_message_revisions
                (revision_id, message_id, session_id, role, content, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                message_revision_id,
                message["message_id"],
                message["session_id"],
                message["role"],
                message["content"],
                _json_dumps(message["metadata"]),
                message["created_at"],
            ),
        )
        if message["run_id"]:
            connection.execute(
                """
                INSERT OR IGNORE INTO buddy_message_run_refs
                    (message_id, run_id, relation, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (message["message_id"], message["run_id"], "primary", message["created_at"]),
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


def _sanitize_chat_message_metadata(metadata: dict[str, Any]) -> dict[str, Any]:
    sanitized = dict(metadata)
    derived_kind = str(sanitized.get("kind") or "").strip()
    if derived_kind in {"output_trace", "public_output"}:
        sanitized.pop("kind", None)
    for key in ("outputTrace", "publicOutput", "output_trace", "public_output"):
        sanitized.pop(key, None)
    return sanitized


def _recall_chat_messages_browse(*, limit: int) -> dict[str, Any]:
    sessions = _list_browsable_recall_sessions(limit=limit)
    return {
        "kind": "buddy_session_recall",
        "mode": "browse",
        "query": "",
        "hit_count": 0,
        "session_count": len(sessions),
        "sessions": [_browse_session_entry(session) for session in sessions],
    }


def _browse_session_entry(session: dict[str, Any]) -> dict[str, Any]:
    session_id = str(session.get("session_id") or "").strip()
    lineage_root = str(session.get("lineage_root_session_id") or _resolve_session_lineage_root(session_id) or session_id)
    summary_refs = _session_summary_source_refs(session_id, lineage_root)
    return {
        **session,
        "lineage_root_session_id": lineage_root,
        "messages": [],
        "hit_message_ids": [],
        "summary_refs": summary_refs,
        "source_refs": _session_search_source_refs([], hit_message_ids=[], summary_refs=summary_refs),
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
    embedding_model_ref: str = "",
    reranker_model_ref: str = "",
) -> dict[str, Any]:
    if not query:
        return _recall_chat_messages_browse(limit=limit)
    if embedding_model_ref:
        raw_hits = _search_chat_message_hits_hybrid(
            query,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
            limit=max(50, limit * 10),
            role_filter=role_filter,
        )
    else:
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
        hit_message_ids = [
            str(candidate.get("message_id") or "")
            for candidate in raw_hits
            if _resolve_session_lineage_root(str(candidate.get("session_id") or "")) == dedupe_key
        ]
        summary_refs = _session_summary_source_refs(hit_session_id, lineage_root or hit_session_id)
        entry = {
            **session,
            "lineage_root_session_id": lineage_root or hit_session_id,
            "matched_role": str(hit.get("role") or ""),
            "match_message_id": str(hit.get("message_id") or ""),
            "snippet": str(hit.get("snippet") or ""),
            "retrieval": _coerce_dict(hit.get("retrieval")),
            "summary_refs": summary_refs,
            "source_refs": _session_search_source_refs(
                view["messages"],
                hit_message_ids=hit_message_ids,
                summary_refs=summary_refs,
            ),
            "bookend_start": view["bookend_start"],
            "messages": view["messages"],
            "bookend_end": view["bookend_end"],
            "messages_before": view["messages_before"],
            "messages_after": view["messages_after"],
            "has_more_before": view["has_more_before"],
            "has_more_after": view["has_more_after"],
            "hit_message_ids": hit_message_ids,
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
        "retrieval_mode": "hybrid" if embedding_model_ref else "keyword",
        "embedding_model_ref": str(embedding_model_ref or "").strip(),
        "reranker_model_ref": str(reranker_model_ref or "").strip(),
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
    lineage_root = _resolve_session_lineage_root(session_id) or session_id
    summary_refs = _session_summary_source_refs(session_id, lineage_root)
    return {
        "kind": "buddy_session_recall",
        "mode": "scroll",
        "query": "",
        "hit_count": 1 if view["messages"] else 0,
        "session_count": 1,
        "sessions": [
            {
                **session,
                "lineage_root_session_id": lineage_root,
                "messages": view["messages"],
                "hit_message_ids": [anchor_message_id] if anchor_message_id else [],
                "summary_refs": summary_refs,
                "source_refs": _session_search_source_refs(
                    view["messages"],
                    hit_message_ids=[anchor_message_id] if anchor_message_id else [],
                    summary_refs=summary_refs,
                ),
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


def _search_chat_message_hits_hybrid(
    query: str,
    *,
    embedding_model_ref: str,
    reranker_model_ref: str = "",
    limit: int,
    role_filter: tuple[str, ...],
) -> list[dict[str, Any]]:
    from app.core.storage.retrieval_store import hybrid_search

    results = hybrid_search(
        query,
        filters={"source_kind": "buddy_message"},
        embedding_model_ref=embedding_model_ref,
        reranker_model_ref=reranker_model_ref,
        limit=limit,
    )
    hits: list[dict[str, Any]] = []
    for result in results:
        for message_id in _retrieval_result_message_ids(result):
            try:
                message = _get_chat_message(message_id)
                session = get_chat_session(str(message.get("session_id") or ""))
            except KeyError:
                continue
            if not _is_recall_context_message(message, role_filter) or not _is_recall_visible_session(session):
                continue
            hits.append(
                {
                    "message_id": message_id,
                    "session_id": str(message.get("session_id") or ""),
                    "role": str(message.get("role") or ""),
                    "snippet": str(result.get("snippet") or "") or _make_text_snippet(str(message.get("content") or ""), tokens=_query_search_tokens(query)),
                    "created_at": str(message.get("created_at") or ""),
                    "parent_session_id": session.get("parent_session_id"),
                    "source": str(session.get("source") or "buddy"),
                    "retrieval": _coerce_dict(result.get("retrieval")),
                }
            )
    return _dedupe_hit_rows(hits)


def _retrieval_result_message_ids(result: dict[str, Any]) -> list[str]:
    source_ref = _coerce_dict(result.get("source_ref"))
    source_locator = _coerce_dict(source_ref.get("source_locator"))
    metadata = _coerce_dict(result.get("metadata"))
    message_ids: list[str] = []

    def append_id(value: Any) -> None:
        message_id = str(value or "").strip()
        if message_id and message_id not in message_ids:
            message_ids.append(message_id)

    for source in (source_locator, metadata):
        for key in ("primary_message_ids", "message_ids"):
            values = source.get(key)
            if isinstance(values, list):
                for value in values:
                    append_id(value)
            else:
                append_id(values)
        append_id(source.get("message_id"))
    append_id(source_ref.get("source_id") or result.get("source_id"))
    return message_ids


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


def _session_search_source_refs(
    messages: list[dict[str, Any]],
    *,
    hit_message_ids: list[str],
    summary_refs: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    source_refs: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str, str, str]] = set()
    message_ids: list[str] = []

    def append_ref(ref: dict[str, Any]) -> None:
        key = (
            str(ref.get("source_kind") or ""),
            str(ref.get("source_id") or ""),
            str(ref.get("relation") or ""),
            str(ref.get("message_id") or ""),
            str(ref.get("source_revision_id") or ""),
        )
        if not key[0] or not key[1] or key in seen:
            return
        seen.add(key)
        source_refs.append(ref)

    del hit_message_ids
    for message in messages:
        message_id = str(message.get("message_id") or "").strip()
        if not message_id:
            continue
        message_ids.append(message_id)
        append_ref(
            {
                "source_kind": "buddy_message",
                "source_id": message_id,
                "role": str(message.get("role") or ""),
            }
        )
    for ref in _chat_message_run_source_refs(message_ids):
        append_ref(ref)
    for ref in summary_refs or []:
        append_ref(ref)
    return source_refs


def _session_summary_source_refs(session_id: str, lineage_root_session_id: str) -> list[dict[str, Any]]:
    normalized_session_id = str(session_id or "").strip()
    normalized_lineage_root = str(lineage_root_session_id or "").strip()
    if not normalized_session_id and not normalized_lineage_root:
        return []
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT summary_id, session_id, lineage_root_session_id, content, source_refs_json,
                   source_run_id, source_revision_id, created_at, updated_at
            FROM buddy_session_summaries
            WHERE session_id = ?
               OR lineage_root_session_id = ?
            ORDER BY updated_at DESC, rowid DESC
            LIMIT 5
            """,
            (normalized_session_id, normalized_lineage_root),
        ).fetchall()
    refs: list[dict[str, Any]] = []
    seen_summary_ids: set[str] = set()
    for row in rows:
        summary_id = str(row["summary_id"] or "")
        if not summary_id or summary_id in seen_summary_ids:
            continue
        seen_summary_ids.add(summary_id)
        refs.append(_session_summary_source_ref_from_row(row))
    return refs


def _session_summary_source_ref_from_row(row: Any) -> dict[str, Any]:
    content = str(row["content"] or "")
    return {
        "source_kind": "buddy_session_summary",
        "source_id": str(row["summary_id"] or ""),
        "source_revision_id": str(row["source_revision_id"] or ""),
        "session_id": str(row["session_id"] or ""),
        "lineage_root_session_id": str(row["lineage_root_session_id"] or ""),
        "source_run_id": str(row["source_run_id"] or ""),
        "updated_at": str(row["updated_at"] or ""),
        "snippet": _make_text_snippet(content, tokens=[]),
        "source_refs": _json_loads_list(row["source_refs_json"]),
    }


def _chat_message_run_source_refs(message_ids: list[str]) -> list[dict[str, Any]]:
    normalized_ids = [message_id for message_id in dict.fromkeys(str(item or "").strip() for item in message_ids) if message_id]
    if not normalized_ids:
        return []
    placeholders = ",".join("?" for _ in normalized_ids)
    with _connection() as connection:
        rows = connection.execute(
            f"""
            SELECT message_id, run_id, relation
            FROM buddy_message_run_refs
            WHERE message_id IN ({placeholders})
            ORDER BY created_at ASC, rowid ASC
            """,
            normalized_ids,
        ).fetchall()
    return [
        {
            "source_kind": "graph_run",
            "source_id": str(row["run_id"] or ""),
            "relation": str(row["relation"] or "primary"),
            "message_id": str(row["message_id"] or ""),
        }
        for row in rows
    ]


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


def _iter_run_context_values(run: dict[str, Any]) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    for state_key, value in _coerce_dict(run.get("state_values")).items():
        values.append({"state_key": str(state_key), "node_id": "", "output_key": "", "value": value})
    state_snapshot_values = _coerce_dict(_coerce_dict(run.get("state_snapshot")).get("values"))
    for state_key, value in state_snapshot_values.items():
        values.append({"state_key": str(state_key), "node_id": "", "output_key": "", "value": value})
    for event in run.get("state_events") or []:
        if not isinstance(event, dict):
            continue
        values.append(
            {
                "state_key": str(event.get("state_key") or ""),
                "node_id": str(event.get("node_id") or ""),
                "output_key": str(event.get("output_key") or ""),
                "value": event.get("value"),
            }
        )
    for execution in run.get("node_executions") or []:
        if not isinstance(execution, dict):
            continue
        artifacts = _coerce_dict(execution.get("artifacts"))
        context_report = _coerce_dict(artifacts.get("context_assembly_report"))
        for reference in context_report.get("references") or context_report.get("items") or []:
            if isinstance(reference, dict):
                values.append(
                    {
                        "state_key": str(reference.get("state_key") or reference.get("key") or ""),
                        "node_id": str(execution.get("node_id") or ""),
                        "output_key": str(reference.get("output_key") or ""),
                        "value": reference.get("value") or reference.get("context_ref") or reference,
                    }
                )
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in values:
        state_key = str(item.get("state_key") or "")
        if not state_key:
            continue
        fingerprint = _json_dumps(item)
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        deduped.append(item)
    return deduped


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


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


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
    if target_type == "buddy_identity":
        current = load_buddy_identity()
        _write_with_revision("buddy_identity", "buddy_identity", "restore", current, restored, changed_by, change_reason)
        (BUDDY_HOME_DIR / SOUL_PATH).write_text(render_buddy_identity_markdown(restored), encoding="utf-8")
    elif target_type == "home_file" and target_id in {MEMORY_PATH, USER_PATH}:
        current = load_memory_document() if target_id == MEMORY_PATH else load_user_context_document()
        next_value = {
            "path": target_id,
            "content": str(restored.get("content") or ""),
            "updated_at": utc_now_iso(),
        }
        if not next_value["content"].strip():
            raise ValueError(f"Cannot restore an empty {target_id} revision.")
        _write_with_revision("home_file", target_id, "restore", current, next_value, changed_by, change_reason)
        (BUDDY_HOME_DIR / target_id).write_text(next_value["content"], encoding="utf-8")
        restored = load_memory_document() if target_id == MEMORY_PATH else load_user_context_document()
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


def _normalize_run_template_binding(payload: dict[str, Any]) -> dict[str, Any]:
    template_id = str(payload.get("template_id") or "").strip()
    if not template_id:
        raise ValueError("template_id is required.")
    _ensure_run_template_can_be_bound(template_id)
    template = _load_run_template_record_for_binding(template_id)
    runtime_input_bindings = _resolve_template_runtime_input_bindings(template)
    raw_bindings = payload.get("input_bindings")
    if not isinstance(raw_bindings, dict):
        raise ValueError("input_bindings must be an object.")
    if runtime_input_bindings:
        _validate_template_runtime_input_binding_nodes(template, runtime_input_bindings)
        for node_id, source in raw_bindings.items():
            normalized_node_id = str(node_id or "").strip()
            normalized_source = str(source or "").strip()
            if not normalized_node_id or not normalized_source:
                continue
            if normalized_source in DEPRECATED_BUDDY_INPUT_SOURCES:
                continue
            if normalized_source not in ALLOWED_RUN_TEMPLATE_INPUT_SOURCES:
                raise ValueError(f"Unsupported Buddy input source: {normalized_source}")
            declared_source = runtime_input_bindings.get(normalized_node_id)
            if not declared_source:
                raise ValueError(f"Buddy input node is not declared as a runtime input: {normalized_node_id}")
            if normalized_source != declared_source:
                raise ValueError(f"Buddy input node {normalized_node_id} must be bound to {declared_source}.")
        current_message_count = sum(1 for source in runtime_input_bindings.values() if source == "current_message")
        if current_message_count != 1:
            raise ValueError("current_message must be bound exactly once.")
        return {
            "version": RUN_TEMPLATE_BINDING_VERSION,
            "template_id": template_id,
            "input_bindings": dict(runtime_input_bindings),
            "updated_at": str(payload.get("updated_at") or utc_now_iso()),
        }

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


def _load_run_template_record_for_binding(template_id: str) -> dict[str, Any] | None:
    try:
        from app.templates.loader import load_template_record

        template = load_template_record(template_id)
    except Exception:
        return None
    return template if isinstance(template, dict) else None


def _resolve_template_runtime_input_bindings(template: dict[str, Any] | None) -> dict[str, str]:
    metadata = template.get("metadata") if isinstance(template, dict) and isinstance(template.get("metadata"), dict) else {}
    raw_bindings = metadata.get("buddyRuntimeInputBindings") if isinstance(metadata, dict) else None
    if not isinstance(raw_bindings, dict):
        return {}
    input_bindings: dict[str, str] = {}
    for node_id, source in raw_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        normalized_source = str(source or "").strip()
        if not normalized_node_id or not normalized_source:
            continue
        if normalized_source not in ALLOWED_RUN_TEMPLATE_INPUT_SOURCES:
            raise ValueError(f"Unsupported Buddy input source: {normalized_source}")
        if normalized_source in input_bindings.values():
            raise ValueError(f"Buddy input source is already declared: {normalized_source}")
        input_bindings[normalized_node_id] = normalized_source
    return input_bindings


def _resolve_memory_review_template_runtime_input_bindings(template: dict[str, Any] | None) -> dict[str, str]:
    metadata = template.get("metadata") if isinstance(template, dict) and isinstance(template.get("metadata"), dict) else {}
    raw_bindings = metadata.get("buddyMemoryReviewRuntimeInputBindings") if isinstance(metadata, dict) else None
    if not isinstance(raw_bindings, dict):
        return {}
    input_bindings: dict[str, str] = {}
    for node_id, source in raw_bindings.items():
        normalized_node_id = str(node_id or "").strip()
        normalized_source = str(source or "").strip()
        if not normalized_node_id or not normalized_source:
            continue
        if normalized_source not in ALLOWED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES:
            raise ValueError(f"Unsupported Buddy memory review input source: {normalized_source}")
        if normalized_source in input_bindings.values():
            raise ValueError(f"Buddy memory review input source is already declared: {normalized_source}")
        input_bindings[normalized_node_id] = normalized_source
    return input_bindings


def _validate_template_runtime_input_binding_nodes(template: dict[str, Any] | None, input_bindings: dict[str, str]) -> None:
    nodes = template.get("nodes") if isinstance(template, dict) and isinstance(template.get("nodes"), dict) else {}
    state_schema = template.get("state_schema") if isinstance(template, dict) and isinstance(template.get("state_schema"), dict) else {}
    for node_id in input_bindings:
        node = nodes.get(node_id)
        if not isinstance(node, dict) or node.get("kind") != "input":
            raise ValueError(f"Buddy runtime input node is not an input node: {node_id}")
        writes = node.get("writes")
        if not isinstance(writes, list) or len(writes) != 1 or not isinstance(writes[0], dict):
            raise ValueError(f"Buddy runtime input node must write exactly one state: {node_id}")
        state_key = str(writes[0].get("state") or "").strip()
        if not state_key or state_key not in state_schema:
            raise ValueError(f"Buddy runtime input node writes a missing state: {node_id}")


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
    template = _load_run_template_record_for_binding(template_id)
    runtime_input_bindings = _resolve_memory_review_template_runtime_input_bindings(template)
    raw_bindings = payload.get("input_bindings")
    if not isinstance(raw_bindings, dict):
        raise ValueError("input_bindings must be an object.")
    if runtime_input_bindings:
        _validate_template_runtime_input_binding_nodes(template, runtime_input_bindings)
        for node_id, source in raw_bindings.items():
            normalized_node_id = str(node_id or "").strip()
            normalized_source = str(source or "").strip()
            if not normalized_node_id or not normalized_source:
                continue
            if normalized_source in DEPRECATED_BUDDY_INPUT_SOURCES:
                continue
            if normalized_source not in ALLOWED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES:
                raise ValueError(f"Unsupported Buddy memory review input source: {normalized_source}")
            declared_source = runtime_input_bindings.get(normalized_node_id)
            if not declared_source:
                raise ValueError(f"Buddy memory review input node is not declared as a runtime input: {normalized_node_id}")
            if normalized_source != declared_source:
                raise ValueError(f"Buddy memory review input node {normalized_node_id} must be bound to {declared_source}.")
        source_run_count = sum(1 for source in runtime_input_bindings.values() if source == "source_run_id")
        if source_run_count != 1:
            raise ValueError("source_run_id must be bound exactly once.")
        return {
            "version": MEMORY_REVIEW_TEMPLATE_BINDING_VERSION,
            "template_id": template_id,
            "input_bindings": dict(runtime_input_bindings),
            "updated_at": str(payload.get("updated_at") or utc_now_iso()),
        }

    for source in raw_bindings.values():
        normalized_source = str(source or "").strip()
        if not normalized_source or normalized_source in DEPRECATED_BUDDY_INPUT_SOURCES:
            continue
        if normalized_source not in ALLOWED_MEMORY_REVIEW_TEMPLATE_INPUT_SOURCES:
            raise ValueError(f"Unsupported Buddy memory review input source: {normalized_source}")
    return {
        "version": MEMORY_REVIEW_TEMPLATE_BINDING_VERSION,
        "template_id": template_id,
        "input_bindings": {},
        "updated_at": str(payload.get("updated_at") or utc_now_iso()),
    }


def _memory_review_template_binding_needs_repair(raw_value: dict[str, Any], normalized_value: dict[str, Any]) -> bool:
    raw_template_id = str(raw_value.get("template_id") or "").strip()
    normalized_template_id = str(normalized_value.get("template_id") or "").strip()
    raw_bindings = raw_value.get("input_bindings") if isinstance(raw_value.get("input_bindings"), dict) else {}
    normalized_bindings = normalized_value.get("input_bindings")
    raw_version = int(raw_value.get("version") or MEMORY_REVIEW_TEMPLATE_BINDING_VERSION)
    normalized_version = int(normalized_value.get("version") or MEMORY_REVIEW_TEMPLATE_BINDING_VERSION)
    return (
        raw_template_id != normalized_template_id
        or raw_bindings != normalized_bindings
        or raw_version != normalized_version
    )


def _with_memory_review_template_binding_repair_metadata(
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


def _with_runtime_capability_usage_events(stats: dict[str, Any]) -> dict[str, Any]:
    next_stats = deepcopy(stats)
    persisted_run_ids_by_capability = _persisted_capability_usage_run_ids(next_stats)
    for entry in _runtime_capability_usage_entries():
        capability = entry.get("capability") if isinstance(entry.get("capability"), dict) else {}
        capability_id = f"{capability.get('kind')}:{capability.get('key')}"
        run_id = str(entry.get("run_id") or "")
        if run_id and run_id in persisted_run_ids_by_capability.get(capability_id, set()):
            continue
        _apply_capability_usage_entry(next_stats, entry, now=str(entry.get("used_at") or utc_now_iso()))
    return _normalize_capability_usage_stats(next_stats)


def _persisted_capability_usage_run_ids(stats: dict[str, Any]) -> dict[str, set[str]]:
    capabilities = stats.get("capabilities") if isinstance(stats.get("capabilities"), dict) else {}
    result: dict[str, set[str]] = {}
    for capability_id, record in capabilities.items():
        if not isinstance(record, dict):
            continue
        recent_runs = record.get("recent_runs") if isinstance(record.get("recent_runs"), list) else []
        run_ids = {
            str(item.get("run_id") or "")
            for item in recent_runs
            if isinstance(item, dict) and str(item.get("run_id") or "")
        }
        if run_ids:
            result[str(capability_id)] = run_ids
    return result


def _runtime_capability_usage_entries() -> list[dict[str, Any]]:
    with _connection() as connection:
        rows = connection.execute(
            """
            SELECT
                event_id,
                invocation_id,
                run_id,
                capability_kind,
                capability_key,
                status,
                latency_ms,
                error_type,
                error_message,
                permission_result,
                summary,
                created_at
            FROM capability_usage_events
            WHERE capability_key != ''
            ORDER BY created_at, event_id
            """
        ).fetchall()
    entries: list[dict[str, Any]] = []
    for row in rows:
        status = str(row["status"] or "")
        entries.append(
            {
                "capability": {
                    "kind": str(row["capability_kind"] or ""),
                    "key": str(row["capability_key"] or ""),
                },
                "success": _capability_usage_status_succeeded(status),
                "run_id": str(row["run_id"] or ""),
                "summary": str(row["summary"] or row["error_message"] or status),
                "duration_ms": _coerce_non_negative_int(row["latency_ms"]),
                "used_at": str(row["created_at"] or ""),
                "event_id": str(row["event_id"] or ""),
                "invocation_id": str(row["invocation_id"] or ""),
                "status": status,
                "error_type": str(row["error_type"] or ""),
                "error": str(row["error_message"] or ""),
                "permission_result": str(row["permission_result"] or ""),
            }
        )
    return entries


def _capability_usage_status_succeeded(status: str) -> bool:
    return status in {"completed", "complete", "success", "succeeded", "ok"}


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
    used_at = str(entry.get("used_at") or now)
    next_record = {
        **existing,
        "kind": kind,
        "key": key,
        "name": name,
        "use_count": int(existing.get("use_count") or 0) + 1,
        "success_count": int(existing.get("success_count") or 0) + (1 if success else 0),
        "failure_count": int(existing.get("failure_count") or 0) + (0 if success else 1),
        "last_used_at": used_at,
        "last_run_id": run_id,
        "last_summary": summary,
        "last_duration_ms": duration_ms,
    }
    recent_entry = {
        "run_id": run_id,
        "success": success,
        "summary": summary,
        "duration_ms": duration_ms,
        "used_at": used_at,
    }
    for key in ("event_id", "invocation_id", "status", "error_type", "error", "permission_result"):
        value = str(entry.get(key) or "").strip()
        if value:
            recent_entry[key] = value
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
        SOUL_PATH: "Buddy identity, persona, tone, and display preferences.",
        USER_PATH: "Durable context about the human Buddy helps.",
        MEMORY_PATH: "Curated long-term memory.",
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


def _background_review_from_row(row: Any) -> dict[str, Any]:
    return {
        "review_id": str(row["review_id"] or ""),
        "source_run_id": str(row["source_run_id"] or ""),
        "review_run_id": str(row["review_run_id"] or ""),
        "template_id": str(row["template_id"] or ""),
        "status": str(row["status"] or ""),
        "trigger_reason": str(row["trigger_reason"] or ""),
        "metadata": _json_loads_object(row["metadata_json"]),
        "error": str(row["error"] or ""),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
        "started_at": row["started_at"],
        "completed_at": row["completed_at"],
    }


def _improvement_candidate_from_row(row: Any) -> dict[str, Any]:
    return {
        "candidate_id": str(row["candidate_id"] or ""),
        "kind": str(row["kind"] or ""),
        "status": str(row["status"] or "proposed"),
        "status_reason": str(row["status_reason"] or ""),
        "source_run_id": str(row["source_run_id"] or ""),
        "review_id": str(row["review_id"] or ""),
        "review_run_id": str(row["review_run_id"] or ""),
        "target_ref": _json_loads_object(row["target_ref_json"]),
        "evidence_refs": _json_loads_list(row["evidence_refs_json"]),
        "risk_level": str(row["risk_level"] or ""),
        "expected_benefit": str(row["expected_benefit"] or ""),
        "proposed_change_summary": str(row["proposed_change_summary"] or ""),
        "approval_required": bool(row["approval_required"]),
        "validation_run_id": str(row["validation_run_id"] or ""),
        "validation_result": _json_loads_object(row["validation_result_json"]),
        "applied_revision_id": str(row["applied_revision_id"] or ""),
        "applied_command": _json_loads_object(row["applied_command_json"]),
        "applied_at": str(row["applied_at"] or ""),
        "decision": _json_loads_object(row["decision_json"]),
        "decided_at": str(row["decided_at"] or ""),
        "payload": _json_loads_object(row["payload_json"]),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
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


def _normalize_improvement_candidate_id(value: Any) -> str:
    return str(value or "").strip()[:160]


def _normalize_improvement_candidate_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_improvement_candidate_status(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in IMPROVEMENT_CANDIDATE_STATUSES else ""


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


def _json_loads_list(value: Any) -> list[Any]:
    try:
        parsed = json.loads(str(value or "[]"))
    except Exception:
        return []
    return parsed if isinstance(parsed, list) else []


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

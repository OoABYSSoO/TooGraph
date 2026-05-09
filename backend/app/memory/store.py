from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from app.core.storage import database
from app.core.storage.json_file_utils import utc_now_iso


DEFAULT_SCOPE = "user"
DEFAULT_LAYER = "semantic"
DEFAULT_TYPE = "fact"
DEFAULT_STATUS = "active"
ACTIVE_STATUSES = {"active", "candidate"}


def create_memory(
    payload: dict[str, Any],
    *,
    changed_by: str = "system",
    change_reason: str = "",
) -> dict[str, Any]:
    now = utc_now_iso()
    memory = _normalize_memory_payload(payload, created_at=now, updated_at=now)
    memory["id"] = _normalize_identifier(payload.get("id")) or f"mem_{uuid4().hex[:12]}"
    with database.get_connection() as connection:
        connection.execute(
            """
            INSERT INTO memories (
                id, scope, layer, type, summary, content, confidence, importance,
                evidence_json, artifact_refs_json, source_json, status, supersedes_json,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            _memory_row_values(memory),
        )
        _upsert_memory_fts(connection, memory)
        _record_memory_revision(
            connection,
            memory_id=memory["id"],
            action="create",
            previous={},
            next_value=memory,
            actor=changed_by,
            reason=change_reason,
        )
        _record_memory_event(
            connection,
            memory_id=memory["id"],
            action="create",
            actor=changed_by,
            reason=change_reason,
            payload=memory,
        )
        connection.commit()
    return memory


def update_memory(
    memory_id: str,
    payload: dict[str, Any],
    *,
    changed_by: str = "system",
    change_reason: str = "",
) -> dict[str, Any]:
    previous = get_memory(memory_id)
    now = utc_now_iso()
    next_value = _normalize_memory_payload({**previous, **payload}, created_at=previous["created_at"], updated_at=now)
    next_value["id"] = previous["id"]
    return _persist_memory_update(
        previous,
        next_value,
        action="update",
        changed_by=changed_by,
        change_reason=change_reason,
    )


def apply_memory_candidate(
    memory_id: str,
    *,
    changed_by: str = "system",
    change_reason: str = "",
) -> dict[str, Any]:
    return _set_memory_status(
        memory_id,
        status="active",
        action="apply",
        changed_by=changed_by,
        change_reason=change_reason,
    )


def reject_memory_candidate(
    memory_id: str,
    *,
    changed_by: str = "system",
    change_reason: str = "",
) -> dict[str, Any]:
    return _set_memory_status(
        memory_id,
        status="rejected",
        action="reject",
        changed_by=changed_by,
        change_reason=change_reason,
    )


def archive_memory(
    memory_id: str,
    *,
    changed_by: str = "system",
    change_reason: str = "",
) -> dict[str, Any]:
    return _set_memory_status(
        memory_id,
        status="archived",
        action="archive",
        changed_by=changed_by,
        change_reason=change_reason,
    )


def degrade_memory(
    memory_id: str,
    *,
    amount: float = 0.1,
    changed_by: str = "system",
    change_reason: str = "",
) -> dict[str, Any]:
    previous = get_memory(memory_id)
    normalized_amount = max(0.0, min(float(amount or 0), 1.0))
    next_value = {
        **previous,
        "importance": max(0.0, float(previous.get("importance") or 0) - normalized_amount),
        "updated_at": utc_now_iso(),
    }
    return _persist_memory_update(
        previous,
        next_value,
        action="degrade",
        changed_by=changed_by,
        change_reason=change_reason,
    )


def restore_memory_revision(
    memory_id: str,
    revision_id: str,
    *,
    target: str = "previous",
    changed_by: str = "system",
    change_reason: str = "",
) -> dict[str, Any]:
    revision = get_memory_revision(revision_id)
    if revision["memory_id"] != memory_id:
        raise KeyError(memory_id)
    snapshot_key = "previous_value" if target == "previous" else "next_value"
    if target not in {"previous", "next"}:
        raise ValueError("target must be previous or next.")
    snapshot = revision.get(snapshot_key)
    if not isinstance(snapshot, dict) or not snapshot.get("id"):
        raise ValueError("Selected revision snapshot cannot be restored.")
    previous = get_memory(memory_id)
    now = utc_now_iso()
    next_value = _normalize_memory_payload(snapshot, created_at=previous["created_at"], updated_at=now)
    next_value["id"] = previous["id"]
    next_value["created_at"] = str(snapshot.get("created_at") or previous["created_at"])
    current_value = _persist_memory_update(
        previous,
        next_value,
        action="restore",
        changed_by=changed_by,
        change_reason=change_reason,
        event_payload={
            "restored_revision_id": revision_id,
            "target": target,
            "current_value": next_value,
        },
    )
    return {
        "restored_revision": revision,
        "target": target,
        "current_value": current_value,
    }


def get_memory(memory_id: str) -> dict[str, Any]:
    with database.get_connection() as connection:
        row = connection.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
    if row is None:
        raise KeyError(memory_id)
    return _memory_from_row(row)


def list_memories(
    *,
    scope: str | None = None,
    layer: str | None = None,
    memory_type: str | None = None,
    status: str | None = DEFAULT_STATUS,
    include_inactive: bool = False,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    _append_filter(clauses, params, "scope", scope)
    _append_filter(clauses, params, "layer", layer)
    _append_filter(clauses, params, "type", memory_type)
    if include_inactive:
        _append_filter(clauses, params, "status", status)
    elif status:
        _append_filter(clauses, params, "status", status)
    else:
        placeholders = ", ".join("?" for _ in ACTIVE_STATUSES)
        clauses.append(f"status IN ({placeholders})")
        params.extend(sorted(ACTIVE_STATUSES))
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    with database.get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM memories
            {where}
            ORDER BY importance DESC, updated_at DESC, created_at DESC
            """,
            params,
        ).fetchall()
    return [_memory_from_row(row) for row in rows]


def recall_memories(
    *,
    query: str | None = None,
    scope: str | None = None,
    layer: str | None = None,
    memory_type: str | None = None,
    status: str | None = DEFAULT_STATUS,
    top_k: int = 8,
    max_chars: int = 4000,
) -> dict[str, Any]:
    candidates = _search_memory_candidates(
        query=query,
        scope=scope,
        layer=layer,
        memory_type=memory_type,
        status=status,
        top_k=max(1, min(int(top_k or 8), 50)),
    )
    budget = max(1, int(max_chars or 4000))
    included: list[dict[str, Any]] = []
    omitted: list[dict[str, Any]] = []
    used_chars = 0
    for memory in candidates:
        char_count = _memory_context_char_count(memory)
        if included and used_chars + char_count > budget:
            omitted.append(_omitted_memory_record(memory, char_count))
            continue
        if used_chars + char_count > budget:
            omitted.append(_omitted_memory_record(memory, char_count))
            continue
        included.append({**memory, "char_count": char_count})
        used_chars += char_count
    return {
        "query": str(query or "").strip(),
        "scope": scope or "",
        "layer": layer or "",
        "type": memory_type or "",
        "status": status or "",
        "max_chars": budget,
        "used_chars": used_chars,
        "total_count": len(candidates),
        "included_count": len(included),
        "omitted_count": len(omitted),
        "memories": included,
        "omitted": omitted,
    }


def list_memory_revisions(memory_id: str) -> list[dict[str, Any]]:
    with database.get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM memory_revisions
            WHERE memory_id = ?
            ORDER BY created_at ASC
            """,
            (memory_id,),
        ).fetchall()
    return [_revision_from_row(row) for row in rows]


def get_memory_revision(revision_id: str) -> dict[str, Any]:
    with database.get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM memory_revisions WHERE revision_id = ?",
            (revision_id,),
        ).fetchone()
    if row is None:
        raise KeyError(revision_id)
    return _revision_from_row(row)


def list_memory_events(memory_id: str) -> list[dict[str, Any]]:
    with database.get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM memory_events
            WHERE memory_id = ?
            ORDER BY created_at ASC
            """,
            (memory_id,),
        ).fetchall()
    return [_event_from_row(row) for row in rows]


def load_memories(memory_type: str | None = None) -> list[dict[str, Any]]:
    return list_memories(memory_type=memory_type or None, status=None)


def _set_memory_status(
    memory_id: str,
    *,
    status: str,
    action: str,
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    previous = get_memory(memory_id)
    next_value = {
        **previous,
        "status": _normalize_label(status, DEFAULT_STATUS),
        "updated_at": utc_now_iso(),
    }
    return _persist_memory_update(
        previous,
        next_value,
        action=action,
        changed_by=changed_by,
        change_reason=change_reason,
    )


def _persist_memory_update(
    previous: dict[str, Any],
    next_value: dict[str, Any],
    *,
    action: str,
    changed_by: str,
    change_reason: str,
    event_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    memory_id = previous["id"]
    next_value = {**next_value, "id": memory_id}
    with database.get_connection() as connection:
        connection.execute(
            """
            UPDATE memories
            SET scope = ?, layer = ?, type = ?, summary = ?, content = ?,
                confidence = ?, importance = ?, evidence_json = ?, artifact_refs_json = ?,
                source_json = ?, status = ?, supersedes_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                next_value["scope"],
                next_value["layer"],
                next_value["type"],
                next_value["summary"],
                next_value["content"],
                next_value["confidence"],
                next_value["importance"],
                _json_dumps(next_value["evidence"]),
                _json_dumps(next_value["artifact_refs"]),
                _json_dumps(next_value["source"]),
                next_value["status"],
                _json_dumps(next_value["supersedes"]),
                next_value["updated_at"],
                memory_id,
            ),
        )
        _upsert_memory_fts(connection, next_value)
        _record_memory_revision(
            connection,
            memory_id=memory_id,
            action=action,
            previous=previous,
            next_value=next_value,
            actor=changed_by,
            reason=change_reason,
        )
        _record_memory_event(
            connection,
            memory_id=memory_id,
            action=action,
            actor=changed_by,
            reason=change_reason,
            payload=event_payload or next_value,
        )
        connection.commit()
    return next_value


def _search_memory_candidates(
    *,
    query: str | None,
    scope: str | None,
    layer: str | None,
    memory_type: str | None,
    status: str | None,
    top_k: int,
) -> list[dict[str, Any]]:
    normalized_query = _normalize_fts_query(query)
    filters: list[str] = []
    params: list[Any] = []
    _append_filter(filters, params, "m.scope", scope)
    _append_filter(filters, params, "m.layer", layer)
    _append_filter(filters, params, "m.type", memory_type)
    _append_filter(filters, params, "m.status", status)
    where = f"WHERE {' AND '.join(filters)}" if filters else ""
    if normalized_query:
        query_where = f"{where} AND memories_fts MATCH ?" if where else "WHERE memories_fts MATCH ?"
        with database.get_connection() as connection:
            rows = connection.execute(
                f"""
                SELECT m.*
                FROM memories_fts
                JOIN memories m ON m.id = memories_fts.memory_id
                {query_where}
                ORDER BY bm25(memories_fts), m.importance DESC, m.updated_at DESC
                LIMIT ?
                """,
                [*params, normalized_query, top_k],
            ).fetchall()
        return [_memory_from_row(row) for row in rows]
    return list_memories(
        scope=scope,
        layer=layer,
        memory_type=memory_type,
        status=status,
    )[:top_k]


def _normalize_memory_payload(payload: dict[str, Any], *, created_at: str, updated_at: str) -> dict[str, Any]:
    summary = str(payload.get("summary") or payload.get("title") or "").strip()
    content = str(payload.get("content") or "").strip()
    if not summary:
        summary = content[:80].strip() or "Untitled memory"
    return {
        "scope": _normalize_label(payload.get("scope"), DEFAULT_SCOPE),
        "layer": _normalize_label(payload.get("layer"), DEFAULT_LAYER),
        "type": _normalize_label(payload.get("type") or payload.get("memory_type"), DEFAULT_TYPE),
        "summary": summary,
        "content": content,
        "confidence": _normalize_float(payload.get("confidence"), 1.0),
        "importance": _normalize_float(payload.get("importance"), 0.5),
        "evidence": _normalize_list(payload.get("evidence")),
        "artifact_refs": _normalize_list(payload.get("artifact_refs") or payload.get("artifactRefs")),
        "source": _normalize_dict(payload.get("source")),
        "status": _normalize_label(payload.get("status"), DEFAULT_STATUS),
        "supersedes": _normalize_list(payload.get("supersedes")),
        "created_at": str(payload.get("created_at") or created_at),
        "updated_at": updated_at,
    }


def _memory_row_values(memory: dict[str, Any]) -> tuple[Any, ...]:
    return (
        memory["id"],
        memory["scope"],
        memory["layer"],
        memory["type"],
        memory["summary"],
        memory["content"],
        memory["confidence"],
        memory["importance"],
        _json_dumps(memory["evidence"]),
        _json_dumps(memory["artifact_refs"]),
        _json_dumps(memory["source"]),
        memory["status"],
        _json_dumps(memory["supersedes"]),
        memory["created_at"],
        memory["updated_at"],
    )


def _upsert_memory_fts(connection: Any, memory: dict[str, Any]) -> None:
    connection.execute("DELETE FROM memories_fts WHERE memory_id = ?", (memory["id"],))
    if memory.get("status") not in ACTIVE_STATUSES:
        return
    connection.execute(
        """
        INSERT INTO memories_fts (memory_id, scope, layer, type, status, summary, content)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            memory["id"],
            memory["scope"],
            memory["layer"],
            memory["type"],
            memory["status"],
            memory["summary"],
            memory["content"],
        ),
    )


def _record_memory_revision(
    connection: Any,
    *,
    memory_id: str,
    action: str,
    previous: dict[str, Any],
    next_value: dict[str, Any],
    actor: str,
    reason: str,
) -> None:
    connection.execute(
        """
        INSERT INTO memory_revisions (
            revision_id, memory_id, action, previous_json, next_json, actor, reason, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"memrev_{uuid4().hex[:12]}",
            memory_id,
            action,
            _json_dumps(previous),
            _json_dumps(next_value),
            str(actor or ""),
            str(reason or ""),
            utc_now_iso(),
        ),
    )


def _record_memory_event(
    connection: Any,
    *,
    memory_id: str,
    action: str,
    actor: str,
    reason: str,
    payload: dict[str, Any],
) -> None:
    connection.execute(
        """
        INSERT INTO memory_events (event_id, memory_id, action, actor, reason, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"memevt_{uuid4().hex[:12]}",
            memory_id,
            action,
            str(actor or ""),
            str(reason or ""),
            _json_dumps(payload),
            utc_now_iso(),
        ),
    )


def _memory_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "scope": str(row["scope"] or DEFAULT_SCOPE),
        "layer": str(row["layer"] or DEFAULT_LAYER),
        "type": str(row["type"] or DEFAULT_TYPE),
        "summary": str(row["summary"] or ""),
        "content": str(row["content"] or ""),
        "confidence": float(row["confidence"] if row["confidence"] is not None else 1),
        "importance": float(row["importance"] if row["importance"] is not None else 0.5),
        "evidence": _json_loads(row["evidence_json"], []),
        "artifact_refs": _json_loads(row["artifact_refs_json"], []),
        "source": _json_loads(row["source_json"], {}),
        "status": str(row["status"] or DEFAULT_STATUS),
        "supersedes": _json_loads(row["supersedes_json"], []),
        "created_at": str(row["created_at"] or ""),
        "updated_at": str(row["updated_at"] or ""),
    }


def _revision_from_row(row: Any) -> dict[str, Any]:
    return {
        "revision_id": str(row["revision_id"] or ""),
        "memory_id": str(row["memory_id"] or ""),
        "action": str(row["action"] or ""),
        "previous_value": _json_loads(row["previous_json"], {}),
        "next_value": _json_loads(row["next_json"], {}),
        "actor": str(row["actor"] or ""),
        "reason": str(row["reason"] or ""),
        "created_at": str(row["created_at"] or ""),
    }


def _event_from_row(row: Any) -> dict[str, Any]:
    return {
        "event_id": str(row["event_id"] or ""),
        "memory_id": str(row["memory_id"] or ""),
        "action": str(row["action"] or ""),
        "actor": str(row["actor"] or ""),
        "reason": str(row["reason"] or ""),
        "payload": _json_loads(row["payload_json"], {}),
        "created_at": str(row["created_at"] or ""),
    }


def _append_filter(clauses: list[str], params: list[Any], column: str, value: str | None) -> None:
    normalized = str(value or "").strip()
    if not normalized:
        return
    clauses.append(f"{column} = ?")
    params.append(normalized)


def _normalize_fts_query(value: str | None) -> str:
    terms = [
        term
        for term in "".join(char if char.isalnum() else " " for char in str(value or "").lower()).split()
        if term
    ]
    return " OR ".join(terms[:8])


def _memory_context_char_count(memory: dict[str, Any]) -> int:
    return len(str(memory.get("summary") or "")) + len(str(memory.get("content") or ""))


def _omitted_memory_record(memory: dict[str, Any], char_count: int) -> dict[str, Any]:
    return {
        "id": str(memory.get("id") or ""),
        "scope": str(memory.get("scope") or ""),
        "layer": str(memory.get("layer") or ""),
        "type": str(memory.get("type") or ""),
        "summary": str(memory.get("summary") or "")[:120],
        "char_count": char_count,
    }


def _normalize_identifier(value: Any) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    return "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in normalized)[:80]


def _normalize_label(value: Any, default: str) -> str:
    normalized = str(value or "").strip().lower().replace(" ", "_")
    return _normalize_identifier(normalized) or default


def _normalize_float(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _normalize_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _normalize_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _json_loads(value: Any, fallback: Any) -> Any:
    try:
        parsed = json.loads(str(value or ""))
    except Exception:
        return fallback
    if isinstance(fallback, list):
        return parsed if isinstance(parsed, list) else []
    if isinstance(fallback, dict):
        return parsed if isinstance(parsed, dict) else {}
    return parsed

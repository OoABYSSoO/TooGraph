from __future__ import annotations

from difflib import SequenceMatcher
import hashlib
import json
import re
import unicodedata
from typing import Any
from uuid import uuid4

from app.core.storage.database import get_connection
from app.core.storage.retrieval_store import hybrid_search, search_retrieval_fts, upsert_retrieval_chunks, upsert_retrieval_document


SUPPORTED_MEMORY_SOURCE_KINDS = {
    "buddy_message",
    "graph_run",
    "graph_output",
    "retrieval_chunk",
    "memory_entry",
}
MEMORY_STATUSES = {"active", "archived"}
NEAR_DUPLICATE_MIN_CHARS = 18
NEAR_DUPLICATE_SIMILARITY_THRESHOLD = 0.58


def create_memory_entry(
    *,
    scope_kind: str,
    scope_id: str,
    layer: str,
    memory_type: str,
    title: str,
    content: str,
    status: str = "active",
    confidence: float = 0.0,
    salience: float = 0.0,
    sources: list[dict[str, Any]] | None = None,
    metadata: dict[str, Any] | None = None,
    memory_id: str | None = None,
    changed_by: str = "system",
    change_reason: str = "create_memory_entry",
) -> dict[str, Any]:
    explicit_memory_id = bool(str(memory_id or "").strip())
    payload = _normalize_memory_payload(
        {
            "memory_id": str(memory_id or "").strip() or f"mem_{uuid4().hex[:12]}",
            "scope_kind": scope_kind,
            "scope_id": scope_id,
            "layer": layer,
            "memory_type": memory_type,
            "status": status,
            "title": title,
            "content": content,
            "confidence": confidence,
            "salience": salience,
            "metadata": metadata or {},
        }
    )
    normalized_sources = _normalize_sources(sources or [])
    now = _utc_now_sql()
    duplicate_memory_id = ""
    duplicate_result: dict[str, Any] | None = None
    with get_connection() as connection:
        if not explicit_memory_id:
            duplicate_match = _find_duplicate_memory_entry(connection, payload)
            if duplicate_match is not None:
                duplicate = _coerce_dict(duplicate_match.get("memory"))
                duplicate_memory_id = str(duplicate["memory_id"])
                _record_duplicate_memory_write(
                    connection,
                    existing=duplicate,
                    requested=payload,
                    requested_sources=normalized_sources,
                    dedupe_reason=str(duplicate_match.get("reason") or "duplicate_canonical_content"),
                    similarity_score=float(duplicate_match.get("similarity_score") or 1.0),
                    changed_by=changed_by,
                    change_reason=change_reason,
                    created_at=now,
                )
                duplicate_result = _duplicate_memory_result(
                    existing=duplicate,
                    requested=payload,
                    requested_sources=normalized_sources,
                    dedupe_reason=str(duplicate_match.get("reason") or "duplicate_canonical_content"),
                    similarity_score=float(duplicate_match.get("similarity_score") or 1.0),
                )
        if not duplicate_memory_id:
            connection.execute(
                """
                INSERT INTO memory_entries (
                    memory_id,
                    scope_kind,
                    scope_id,
                    layer,
                    memory_type,
                    status,
                    title,
                    content,
                    confidence,
                    salience,
                    metadata_json,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["memory_id"],
                    payload["scope_kind"],
                    payload["scope_id"],
                    payload["layer"],
                    payload["memory_type"],
                    payload["status"],
                    payload["title"],
                    payload["content"],
                    payload["confidence"],
                    payload["salience"],
                    _json_dumps(payload["metadata"]),
                    now,
                    now,
                ),
            )
            _replace_memory_sources(connection, payload["memory_id"], normalized_sources, created_at=now)
            revision = _insert_memory_revision(
                connection,
                memory_id=payload["memory_id"],
                operation="create",
                previous={},
                next_value={**payload, "sources": normalized_sources},
                changed_by=changed_by,
                change_reason=change_reason,
                created_at=now,
            )
            connection.execute(
                "UPDATE memory_entries SET latest_revision_id = ? WHERE memory_id = ?",
                (revision["revision_id"], payload["memory_id"]),
            )
            _insert_memory_event(
                connection,
                memory_id=payload["memory_id"],
                event_type="created",
                detail={"revision_id": revision["revision_id"]},
                created_at=now,
            )
    if duplicate_memory_id:
        _project_memory_to_retrieval(duplicate_memory_id)
        return_value = load_memory_entry(duplicate_memory_id)
        return_value["dedupe"] = duplicate_result or {}
        return return_value
    _project_memory_to_retrieval(payload["memory_id"])
    return load_memory_entry(payload["memory_id"])


def _find_duplicate_memory_entry(connection: Any, payload: dict[str, Any]) -> dict[str, Any] | None:
    fingerprint = _memory_content_fingerprint(str(payload.get("content") or ""))
    rows = connection.execute(
        """
        SELECT *
        FROM memory_entries
        WHERE scope_kind = ?
          AND scope_id = ?
          AND layer = ?
          AND memory_type = ?
          AND status = 'active'
        ORDER BY updated_at DESC, memory_id ASC
        """,
        (
            payload["scope_kind"],
            payload["scope_id"],
            payload["layer"],
            payload["memory_type"],
        ),
    ).fetchall()
    best_near_match: dict[str, Any] | None = None
    best_near_score = 0.0
    for row in rows:
        memory = _memory_entry_from_row_with_context(connection, row)
        if _memory_content_fingerprint(str(row["content"] or "")) == fingerprint:
            return {
                "memory": memory,
                "reason": "duplicate_canonical_content",
                "similarity_score": 1.0,
            }
        near_score = _memory_near_duplicate_score(str(payload.get("content") or ""), str(row["content"] or ""))
        if near_score >= NEAR_DUPLICATE_SIMILARITY_THRESHOLD and near_score > best_near_score:
            best_near_score = near_score
            best_near_match = {
                "memory": memory,
                "reason": "near_duplicate_content",
                "similarity_score": round(near_score, 4),
            }
    return best_near_match


def _memory_entry_from_row_with_context(connection: Any, row: Any) -> dict[str, Any]:
    sources = connection.execute(
        """
        SELECT *
        FROM memory_entry_sources
        WHERE memory_id = ?
        ORDER BY ordinal ASC
        """,
        (str(row["memory_id"]),),
    ).fetchall()
    revisions = connection.execute(
        """
        SELECT *
        FROM memory_revisions
        WHERE memory_id = ?
        ORDER BY revision_number ASC
        """,
        (str(row["memory_id"]),),
    ).fetchall()
    return _memory_from_row(row, sources=sources, revisions=revisions)


def _record_duplicate_memory_write(
    connection: Any,
    *,
    existing: dict[str, Any],
    requested: dict[str, Any],
    requested_sources: list[dict[str, Any]],
    dedupe_reason: str,
    similarity_score: float,
    changed_by: str,
    change_reason: str,
    created_at: str,
) -> None:
    merged_sources = _merge_memory_sources(_normalize_sources(existing.get("sources") or []), requested_sources)
    revision_id = ""
    if merged_sources != _normalize_sources(existing.get("sources") or []):
        _replace_memory_sources(connection, existing["memory_id"], merged_sources, created_at=created_at)
        revision = _insert_memory_revision(
            connection,
            memory_id=existing["memory_id"],
            operation="dedupe_merge_sources",
            previous=existing,
            next_value={**existing, "sources": merged_sources},
            changed_by=changed_by,
            change_reason=change_reason,
            created_at=created_at,
        )
        revision_id = revision["revision_id"]
        connection.execute(
            "UPDATE memory_entries SET latest_revision_id = ?, updated_at = ? WHERE memory_id = ?",
            (revision_id, created_at, existing["memory_id"]),
        )
    _insert_memory_event(
        connection,
        memory_id=existing["memory_id"],
        event_type="duplicate_skipped",
        detail={
            "reason": dedupe_reason,
            "requested_title": requested["title"],
            "requested_memory_type": requested["memory_type"],
            "requested_source_count": len(requested_sources),
            "merged_source_count": len(merged_sources),
            "content_fingerprint": _memory_content_fingerprint(requested["content"]),
            "similarity_score": similarity_score,
            **({"revision_id": revision_id} if revision_id else {}),
        },
        created_at=created_at,
    )


def _duplicate_memory_result(
    *,
    existing: dict[str, Any],
    requested: dict[str, Any],
    requested_sources: list[dict[str, Any]],
    dedupe_reason: str,
    similarity_score: float,
) -> dict[str, Any]:
    return {
        "status": "skipped_duplicate",
        "reason": dedupe_reason,
        "duplicate_of": existing["memory_id"],
        "requested_title": requested["title"],
        "requested_source_count": len(requested_sources),
        "content_fingerprint": _memory_content_fingerprint(requested["content"]),
        "similarity_score": similarity_score,
    }


def _merge_memory_sources(
    existing_sources: list[dict[str, Any]],
    requested_sources: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source in [*existing_sources, *requested_sources]:
        identity = _memory_source_identity(source)
        if identity in seen:
            continue
        seen.add(identity)
        merged.append(source)
    return merged


def _memory_source_identity(source: dict[str, Any]) -> str:
    return _json_dumps(
        {
            "source_kind": str(source.get("source_kind") or ""),
            "source_id": str(source.get("source_id") or ""),
            "source_revision_id": str(source.get("source_revision_id") or ""),
            "source_locator": _coerce_dict(source.get("source_locator")),
        }
    )


def _memory_content_fingerprint(content: str) -> str:
    return "sha256:" + hashlib.sha256(_canonical_memory_content(content).encode("utf-8")).hexdigest()


def _memory_near_duplicate_score(left: str, right: str) -> float:
    left_canonical = _canonical_memory_content(left)
    right_canonical = _canonical_memory_content(right)
    if min(len(left_canonical), len(right_canonical)) < NEAR_DUPLICATE_MIN_CHARS:
        return 0.0
    sequence_score = SequenceMatcher(None, left_canonical, right_canonical).ratio()
    token_score = _memory_token_overlap_score(left_canonical, right_canonical)
    return max(sequence_score, token_score)


def _memory_token_overlap_score(left: str, right: str) -> float:
    left_tokens = _memory_similarity_tokens(left)
    right_tokens = _memory_similarity_tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    overlap = len(left_tokens & right_tokens)
    return overlap / max(1, min(len(left_tokens), len(right_tokens)))


def _memory_similarity_tokens(content: str) -> set[str]:
    tokens: set[str] = set()
    for word in re.findall(r"[a-z0-9][a-z0-9._-]{1,}", content):
        tokens.add(word)
    cjk_runs = re.findall(r"[\u3400-\u4dbf\u4e00-\u9fff]+", content)
    for run in cjk_runs:
        compact = re.sub(r"[的了和与及或要先再然后以及用户希望回复说明]", "", run)
        source = compact if len(compact) >= 2 else run
        for index in range(0, max(0, len(source) - 1)):
            tokens.add(source[index : index + 2])
    return tokens


def _canonical_memory_content(content: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(content or "")).strip().lower()
    normalized = re.sub(r"\s+", " ", normalized)
    normalized = re.sub(r"\s*([，。,.;；:：!?！？])\s*", r"\1", normalized)
    return normalized


def update_memory_entry(
    memory_id: str,
    updates: dict[str, Any],
    *,
    changed_by: str = "system",
    change_reason: str = "update_memory_entry",
) -> dict[str, Any]:
    previous = load_memory_entry(memory_id)
    next_payload = _normalize_memory_payload(
        {
            **previous,
            **_coerce_dict(updates),
            "memory_id": previous["memory_id"],
            "metadata": {
                **_coerce_dict(previous.get("metadata")),
                **_coerce_dict(_coerce_dict(updates).get("metadata")),
            },
        }
    )
    now = _utc_now_sql()
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE memory_entries
            SET scope_kind = ?,
                scope_id = ?,
                layer = ?,
                memory_type = ?,
                status = ?,
                title = ?,
                content = ?,
                confidence = ?,
                salience = ?,
                metadata_json = ?,
                updated_at = ?
            WHERE memory_id = ?
            """,
            (
                next_payload["scope_kind"],
                next_payload["scope_id"],
                next_payload["layer"],
                next_payload["memory_type"],
                next_payload["status"],
                next_payload["title"],
                next_payload["content"],
                next_payload["confidence"],
                next_payload["salience"],
                _json_dumps(next_payload["metadata"]),
                now,
                previous["memory_id"],
            ),
        )
        if isinstance(updates.get("sources"), list):
            _replace_memory_sources(connection, previous["memory_id"], _normalize_sources(updates["sources"]), created_at=now)
        revision = _insert_memory_revision(
            connection,
            memory_id=previous["memory_id"],
            operation="update",
            previous=previous,
            next_value=next_payload,
            changed_by=changed_by,
            change_reason=change_reason,
            created_at=now,
        )
        connection.execute(
            "UPDATE memory_entries SET latest_revision_id = ? WHERE memory_id = ?",
            (revision["revision_id"], previous["memory_id"]),
        )
        _insert_memory_event(
            connection,
            memory_id=previous["memory_id"],
            event_type="updated",
            detail={"revision_id": revision["revision_id"]},
            created_at=now,
        )
    _project_memory_to_retrieval(previous["memory_id"])
    return load_memory_entry(previous["memory_id"])


def archive_memory_entry(
    memory_id: str,
    *,
    changed_by: str = "system",
    change_reason: str = "archive_memory_entry",
) -> dict[str, Any]:
    return update_memory_entry(
        memory_id,
        {"status": "archived"},
        changed_by=changed_by,
        change_reason=change_reason,
    )


def load_memory_entry(memory_id: str) -> dict[str, Any]:
    normalized_memory_id = str(memory_id or "").strip()
    with get_connection() as connection:
        row = connection.execute("SELECT * FROM memory_entries WHERE memory_id = ?", (normalized_memory_id,)).fetchone()
        if row is None:
            raise FileNotFoundError(f"Memory entry '{normalized_memory_id}' does not exist.")
        sources = connection.execute(
            """
            SELECT *
            FROM memory_entry_sources
            WHERE memory_id = ?
            ORDER BY ordinal ASC
            """,
            (normalized_memory_id,),
        ).fetchall()
        revisions = connection.execute(
            """
            SELECT *
            FROM memory_revisions
            WHERE memory_id = ?
            ORDER BY revision_number ASC
            """,
            (normalized_memory_id,),
        ).fetchall()
    return _memory_from_row(row, sources=sources, revisions=revisions)


def list_memory_entries(filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    resolved_filters = _coerce_dict(filters)
    where_sql, params = _memory_filter_sql(resolved_filters)
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM memory_entries
            {where_sql}
            ORDER BY salience DESC, updated_at DESC, memory_id ASC
            """,
            params,
        ).fetchall()
    return [load_memory_entry(str(row["memory_id"])) for row in rows]


def recall_memories(
    query: str,
    filters: dict[str, Any] | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    normalized_query = str(query or "").strip()
    normalized_limit = _bounded_int(limit, default=10, minimum=1, maximum=50)
    resolved_filters = _coerce_dict(filters)
    retrieval_filters = {"source_kind": "memory_entry"}
    embedding_model_ref = str(resolved_filters.get("embedding_model_ref") or "").strip()
    reranker_model_ref = str(resolved_filters.get("reranker_model_ref") or "").strip()
    if normalized_query:
        if embedding_model_ref or reranker_model_ref:
            retrieval_results = hybrid_search(
                normalized_query,
                filters=retrieval_filters,
                embedding_model_ref=embedding_model_ref,
                reranker_model_ref=reranker_model_ref,
                limit=normalized_limit * 3,
            )
        else:
            retrieval_results = search_retrieval_fts(normalized_query, filters=retrieval_filters, limit=normalized_limit * 3)
    else:
        retrieval_results = []

    recalled: list[dict[str, Any]] = []
    seen: set[str] = set()
    for result in retrieval_results:
        memory_id = str((result.get("source_ref") or {}).get("source_id") or result.get("source_id") or "")
        if not memory_id or memory_id in seen:
            continue
        try:
            memory = load_memory_entry(memory_id)
        except FileNotFoundError:
            continue
        if not _memory_matches_filters(memory, resolved_filters):
            continue
        recalled.append(
            {
                **memory,
                "snippet": str(result.get("snippet") or ""),
                "score": float(result.get("score") or 0.0),
                "source_ref": _coerce_dict(result.get("source_ref")),
                "retrieval": _coerce_dict(result.get("retrieval")),
            }
        )
        seen.add(memory_id)
        if len(recalled) >= normalized_limit:
            break
    if normalized_query:
        return recalled
    return list_memory_entries({**resolved_filters, "status": resolved_filters.get("status") or "active"})[:normalized_limit]


def _project_memory_to_retrieval(memory_id: str) -> None:
    memory = load_memory_entry(memory_id)
    revision_id = str(memory.get("latest_revision_id") or "")
    document = upsert_retrieval_document(
        document_id=f"memory_doc_{memory['memory_id']}",
        source_kind="memory_entry",
        source_id=memory["memory_id"],
        source_revision_id=revision_id,
        title=memory["title"],
        content=memory["content"],
        scope={
            "scope_kind": memory["scope_kind"],
            "scope_id": memory["scope_id"],
            "layer": memory["layer"],
        },
        metadata=_memory_retrieval_metadata(memory),
    )
    upsert_retrieval_chunks(
        document["document_id"],
        [
            {
                "chunk_id": f"memory_chunk_{memory['memory_id']}",
                "content": memory["content"],
                "source_locator": {"field": "content"},
                "metadata": _memory_retrieval_metadata(memory),
            }
        ],
    )
    _queue_memory_embedding_jobs(memory["memory_id"])


def _queue_memory_embedding_jobs(memory_id: str) -> None:
    try:
        from app.core.storage.embedding_store import list_embedding_models, queue_embedding_job

        models = list_embedding_models(enabled_only=True)
        for model in models:
            queue_embedding_job("memory_entry", memory_id, str(model["embedding_model_id"]))
    except Exception:
        return


def _memory_retrieval_metadata(memory: dict[str, Any]) -> dict[str, Any]:
    return {
        "scope_kind": memory["scope_kind"],
        "scope_id": memory["scope_id"],
        "layer": memory["layer"],
        "memory_type": memory["memory_type"],
        "status": memory["status"],
        "confidence": memory["confidence"],
        "salience": memory["salience"],
        **_coerce_dict(memory.get("metadata")),
    }


def _replace_memory_sources(
    connection: Any,
    memory_id: str,
    sources: list[dict[str, Any]],
    *,
    created_at: str,
) -> None:
    connection.execute("DELETE FROM memory_entry_sources WHERE memory_id = ?", (memory_id,))
    for ordinal, source in enumerate(sources):
        connection.execute(
            """
            INSERT INTO memory_entry_sources (
                source_ref_id,
                memory_id,
                ordinal,
                source_kind,
                source_id,
                source_revision_id,
                source_locator_json,
                metadata_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"{memory_id}:src:{ordinal}",
                memory_id,
                ordinal,
                source["source_kind"],
                source["source_id"],
                source.get("source_revision_id", ""),
                _json_dumps(source.get("source_locator", {})),
                _json_dumps(source.get("metadata", {})),
                created_at,
            ),
        )


def _insert_memory_revision(
    connection: Any,
    *,
    memory_id: str,
    operation: str,
    previous: dict[str, Any],
    next_value: dict[str, Any],
    changed_by: str,
    change_reason: str,
    created_at: str,
) -> dict[str, Any]:
    max_row = connection.execute(
        "SELECT COALESCE(MAX(revision_number), 0) AS max_revision FROM memory_revisions WHERE memory_id = ?",
        (memory_id,),
    ).fetchone()
    revision_number = int(max_row["max_revision"] or 0) + 1
    revision_id = f"memrev_{_short_hash([memory_id, str(revision_number), created_at])}"
    connection.execute(
        """
        INSERT INTO memory_revisions (
            revision_id,
            memory_id,
            revision_number,
            operation,
            previous_json,
            next_json,
            changed_by,
            change_reason,
            created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            revision_id,
            memory_id,
            revision_number,
            operation,
            _json_dumps(previous),
            _json_dumps(next_value),
            str(changed_by or ""),
            str(change_reason or ""),
            created_at,
        ),
    )
    return {"revision_id": revision_id, "revision_number": revision_number, "operation": operation}


def _insert_memory_event(
    connection: Any,
    *,
    memory_id: str,
    event_type: str,
    detail: dict[str, Any],
    created_at: str,
) -> None:
    connection.execute(
        """
        INSERT INTO memory_events (event_id, memory_id, event_type, detail_json, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (f"memevt_{uuid4().hex[:12]}", memory_id, event_type, _json_dumps(detail), created_at),
    )


def _memory_from_row(row: Any, *, sources: list[Any] | None = None, revisions: list[Any] | None = None) -> dict[str, Any]:
    payload = dict(row)
    payload["metadata"] = _json_loads(payload.get("metadata_json"), {})
    payload["confidence"] = float(payload.get("confidence") or 0.0)
    payload["salience"] = float(payload.get("salience") or 0.0)
    payload["sources"] = [_source_from_row(source) for source in (sources or [])]
    payload["revisions"] = [_revision_from_row(revision) for revision in (revisions or [])]
    return payload


def _source_from_row(row: Any) -> dict[str, Any]:
    return {
        "source_kind": str(row["source_kind"] or ""),
        "source_id": str(row["source_id"] or ""),
        "source_revision_id": str(row["source_revision_id"] or ""),
        "source_locator": _json_loads(row["source_locator_json"], {}),
        "metadata": _json_loads(row["metadata_json"], {}),
    }


def _revision_from_row(row: Any) -> dict[str, Any]:
    return {
        "revision_id": str(row["revision_id"] or ""),
        "revision_number": int(row["revision_number"] or 0),
        "operation": str(row["operation"] or ""),
        "created_at": str(row["created_at"] or ""),
    }


def _normalize_memory_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "memory_id": str(payload.get("memory_id") or "").strip(),
        "scope_kind": _required_text(payload.get("scope_kind"), "scope_kind"),
        "scope_id": _required_text(payload.get("scope_id"), "scope_id"),
        "layer": _required_text(payload.get("layer"), "layer"),
        "memory_type": _required_text(payload.get("memory_type"), "memory_type"),
        "status": str(payload.get("status") or "active").strip().lower(),
        "title": str(payload.get("title") or "").strip(),
        "content": _required_text(payload.get("content"), "content"),
        "confidence": _bounded_float(payload.get("confidence"), default=0.0, minimum=0.0, maximum=1.0),
        "salience": _bounded_float(payload.get("salience"), default=0.0, minimum=0.0, maximum=1.0),
        "metadata": _coerce_dict(payload.get("metadata")),
    }
    if normalized["status"] not in MEMORY_STATUSES:
        raise ValueError(f"Unsupported memory status: {normalized['status']}")
    if not normalized["title"]:
        normalized["title"] = normalized["content"][:80]
    return normalized


def _normalize_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for source in sources:
        if not isinstance(source, dict):
            continue
        source_kind = str(source.get("source_kind") or "").strip()
        source_id = str(source.get("source_id") or "").strip()
        if source_kind not in SUPPORTED_MEMORY_SOURCE_KINDS or not source_id:
            raise ValueError(f"Unsupported memory source: {source_kind}")
        normalized.append(
            {
                "source_kind": source_kind,
                "source_id": source_id,
                "source_revision_id": str(source.get("source_revision_id") or "").strip(),
                "source_locator": _coerce_dict(source.get("source_locator")),
                "metadata": _coerce_dict(source.get("metadata")),
            }
        )
    return normalized


def _memory_filter_sql(filters: dict[str, Any]) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    for key in ("scope_kind", "scope_id", "layer", "memory_type", "status"):
        value = str(filters.get(key) or "").strip()
        if not value:
            continue
        clauses.append(f"{key} = ?")
        params.append(value)
    if not clauses:
        return "", []
    return f"WHERE {' AND '.join(clauses)}", params


def _memory_matches_filters(memory: dict[str, Any], filters: dict[str, Any]) -> bool:
    expected_status = str(filters.get("status") or "active").strip()
    if expected_status and memory.get("status") != expected_status:
        return False
    for key in ("scope_kind", "scope_id", "layer", "memory_type"):
        value = str(filters.get(key) or "").strip()
        if value and memory.get(key) != value:
            return False
    return True


def _required_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} is required.")
    return text


def _short_hash(parts: list[str]) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:20]


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _bounded_float(value: Any, *, default: float, minimum: float, maximum: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _json_loads(value: Any, fallback: Any) -> Any:
    if not isinstance(value, str):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _utc_now_sql() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat().replace("+00:00", "Z")

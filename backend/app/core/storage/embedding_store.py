from __future__ import annotations

import hashlib
import json
import math
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.storage.database import get_connection
from app.tools.model_provider_client import embed_text_with_model_ref


SUPPORTED_EMBEDDING_JOB_STATUSES = {"pending", "running", "retry_wait", "completed", "failed", "blocked"}
DEFAULT_DISTANCE_METRIC = "cosine"
DEFAULT_VECTOR_FORMAT = "json"
EMBEDDING_JOB_LEASE_MINUTES = 15
EMBEDDING_JOB_SCAN_PAGE_SIZE = 100


def register_embedding_model(
    *,
    provider_key: str,
    model: str,
    dimensions: int,
    distance_metric: str = DEFAULT_DISTANCE_METRIC,
    vector_format: str = DEFAULT_VECTOR_FORMAT,
    enabled: bool = True,
    metadata: dict[str, Any] | None = None,
    embedding_model_id: str | None = None,
) -> dict[str, Any]:
    normalized_provider = _normalize_label(provider_key, field_name="provider_key")
    normalized_model = _normalize_label(model, field_name="model")
    normalized_dimensions = _bounded_int(dimensions, default=384, minimum=1, maximum=16_384)
    normalized_metric = _normalize_distance_metric(distance_metric)
    normalized_format = str(vector_format or DEFAULT_VECTOR_FORMAT).strip() or DEFAULT_VECTOR_FORMAT
    normalized_model_id = str(embedding_model_id or "").strip() or _embedding_model_id(
        normalized_provider,
        normalized_model,
    )
    now = _utc_now_sql()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO embedding_models (
                embedding_model_id,
                provider_key,
                model,
                dimensions,
                distance_metric,
                vector_format,
                enabled,
                metadata_json,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(provider_key, model) DO UPDATE SET
                dimensions = excluded.dimensions,
                distance_metric = excluded.distance_metric,
                vector_format = excluded.vector_format,
                enabled = excluded.enabled,
                metadata_json = excluded.metadata_json,
                updated_at = excluded.updated_at
            """,
            (
                normalized_model_id,
                normalized_provider,
                normalized_model,
                normalized_dimensions,
                normalized_metric,
                normalized_format,
                int(bool(enabled)),
                _json_dumps(metadata or {}),
                now,
                now,
            ),
        )
        row = connection.execute(
            "SELECT * FROM embedding_models WHERE provider_key = ? AND model = ?",
            (normalized_provider, normalized_model),
        ).fetchone()
    return _model_from_row(row)


def resolve_embedding_model(model_ref: str) -> dict[str, Any]:
    normalized_ref = str(model_ref or "").strip()
    if not normalized_ref:
        raise ValueError("model_ref is required.")
    provider = ""
    model = ""
    for separator in (":", "/"):
        if separator in normalized_ref:
            provider, model = [part.strip() for part in normalized_ref.split(separator, 1)]
            break
    with get_connection() as connection:
        if provider and model:
            row = connection.execute(
                """
                SELECT * FROM embedding_models
                WHERE (provider_key = ? AND model = ?) OR embedding_model_id = ?
                """,
                (provider, model, normalized_ref),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT * FROM embedding_models WHERE embedding_model_id = ?",
                (normalized_ref,),
            ).fetchone()
    if row is None:
        raise FileNotFoundError(f"Embedding model '{normalized_ref}' does not exist.")
    return _model_from_row(row)


def list_embedding_models(*, enabled_only: bool = False) -> list[dict[str, Any]]:
    where_sql = "WHERE enabled = 1" if enabled_only else ""
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT *
            FROM embedding_models
            {where_sql}
            ORDER BY provider_key ASC, model ASC
            """
        ).fetchall()
    return [_model_from_row(row) for row in rows]


def embedding_model_has_vectors(model_ref: str) -> bool:
    model = resolve_embedding_model(model_ref)
    return _embedding_model_has_vectors(str(model["embedding_model_id"] or ""))


def queue_embedding_job(
    source_kind: str,
    source_id: str,
    model_ref: str,
    *,
    operation_id: str = "",
    priority: int = 100,
) -> list[dict[str, Any]]:
    model = resolve_embedding_model(model_ref)
    normalized_source_kind = str(source_kind or "").strip()
    normalized_source_id = str(source_id or "").strip()
    if not normalized_source_kind or not normalized_source_id:
        raise ValueError("source_kind and source_id are required.")
    normalized_operation_id = str(operation_id or "").strip()
    normalized_priority = _bounded_int(priority, default=100, minimum=0, maximum=10_000)
    now = _utc_now_sql()
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT chunk_id, source_kind, source_id, content_hash
            FROM retrieval_chunks
            WHERE source_kind = ? AND source_id = ?
            ORDER BY document_id ASC, ordinal ASC
            """,
            (normalized_source_kind, normalized_source_id),
        ).fetchall()
        queued: list[dict[str, Any]] = []
        for row in rows:
            job_id = _embedding_job_id(
                str(row["chunk_id"]),
                model["embedding_model_id"],
                str(row["content_hash"]),
            )
            connection.execute(
                """
                UPDATE embedding_jobs
                SET status = 'failed',
                    last_error = 'superseded by newer content hash',
                    last_error_type = 'superseded_content_hash',
                    next_retry_at = '',
                    lease_expires_at = '',
                    updated_at = ?,
                    completed_at = ?
                WHERE chunk_id = ?
                  AND embedding_model_id = ?
                  AND content_hash != ?
                  AND status IN ('pending', 'running', 'retry_wait', 'blocked')
                """,
                (
                    now,
                    now,
                    str(row["chunk_id"]),
                    model["embedding_model_id"],
                    str(row["content_hash"]),
                ),
            )
            existing_vector = connection.execute(
                """
                SELECT embedding_id
                FROM embedding_vectors
                WHERE chunk_id = ?
                  AND embedding_model_id = ?
                  AND content_hash = ?
                """,
                (
                    str(row["chunk_id"]),
                    model["embedding_model_id"],
                    str(row["content_hash"]),
                ),
            ).fetchone()
            if existing_vector is not None:
                connection.execute(
                    """
                    UPDATE embedding_jobs
                    SET status = 'completed',
                        last_error = '',
                        last_error_type = '',
                        next_retry_at = '',
                        lease_expires_at = '',
                        updated_at = ?,
                        completed_at = CASE WHEN completed_at = '' THEN ? ELSE completed_at END
                    WHERE chunk_id = ?
                      AND embedding_model_id = ?
                      AND content_hash = ?
                      AND status != 'completed'
                    """,
                    (
                        now,
                        now,
                        str(row["chunk_id"]),
                        model["embedding_model_id"],
                        str(row["content_hash"]),
                    ),
                )
                continue
            connection.execute(
                """
                INSERT INTO embedding_jobs (
                    job_id,
                    operation_id,
                    priority,
                    source_kind,
                    source_id,
                    chunk_id,
                    embedding_model_id,
                    content_hash,
                    status,
                    attempt_count,
                    last_error,
                    created_at,
                    updated_at,
                    completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, '', ?, ?, '')
                ON CONFLICT(chunk_id, embedding_model_id, content_hash) DO UPDATE SET
                    operation_id = excluded.operation_id,
                    priority = excluded.priority,
                    source_kind = excluded.source_kind,
                    source_id = excluded.source_id,
                    status = 'pending',
                    last_error = '',
                    last_error_type = '',
                    next_retry_at = '',
                    lease_expires_at = '',
                    updated_at = excluded.updated_at,
                    completed_at = ''
                """,
                (
                    job_id,
                    normalized_operation_id,
                    normalized_priority,
                    normalized_source_kind,
                    normalized_source_id,
                    str(row["chunk_id"]),
                    model["embedding_model_id"],
                    str(row["content_hash"]),
                    now,
                    now,
                ),
            )
            queued_row = connection.execute("SELECT * FROM embedding_jobs WHERE job_id = ?", (job_id,)).fetchone()
            queued.append(_job_from_row(queued_row))
    return queued


def update_embedding_job_status(
    job_id: str,
    status: str,
    *,
    error: str = "",
    error_type: str = "",
    next_retry_at: str = "",
    lease_expires_at: str = "",
) -> dict[str, Any]:
    normalized_job_id = str(job_id or "").strip()
    normalized_status = str(status or "").strip().lower()
    if normalized_status not in SUPPORTED_EMBEDDING_JOB_STATUSES:
        raise ValueError(f"Unsupported embedding job status: {normalized_status}")
    now = _utc_now_sql()
    completed_at = now if normalized_status == "completed" else ""
    attempt_delta = 1 if normalized_status == "running" else 0
    normalized_next_retry_at = "" if normalized_status == "completed" else str(next_retry_at or "").strip()
    normalized_lease_expires_at = str(lease_expires_at or "").strip()
    if normalized_status == "running" and not normalized_lease_expires_at:
        normalized_lease_expires_at = _lease_expires_at()
    if normalized_status == "completed":
        normalized_lease_expires_at = ""
    with get_connection() as connection:
        existing = connection.execute(
            "SELECT * FROM embedding_jobs WHERE job_id = ?",
            (normalized_job_id,),
        ).fetchone()
        if existing is None:
            raise FileNotFoundError(f"Embedding job '{normalized_job_id}' does not exist.")
        if str(existing["status"] or "") == "failed" and str(existing["last_error_type"] or "") == "superseded_content_hash":
            return _job_from_row(existing)
        connection.execute(
            """
            UPDATE embedding_jobs
            SET status = ?,
                attempt_count = attempt_count + ?,
                last_error = ?,
                last_error_type = ?,
                next_retry_at = ?,
                lease_expires_at = ?,
                updated_at = ?,
                completed_at = ?
            WHERE job_id = ?
            """,
            (
                normalized_status,
                attempt_delta,
                str(error or ""),
                str(error_type or ""),
                normalized_next_retry_at,
                normalized_lease_expires_at,
                now,
                completed_at,
                normalized_job_id,
            ),
        )
        row = connection.execute("SELECT * FROM embedding_jobs WHERE job_id = ?", (normalized_job_id,)).fetchone()
    return _job_from_row(row)


def reset_embedding_jobs_for_operation(operation_id: str, *, statuses: set[str] | None = None) -> int:
    normalized_operation_id = str(operation_id or "").strip()
    if not normalized_operation_id:
        raise ValueError("operation_id is required.")
    reset_statuses = statuses if statuses is not None else {"retry_wait", "blocked", "failed"}
    normalized_statuses = {
        str(status or "").strip().lower()
        for status in reset_statuses
        if str(status or "").strip()
    }
    normalized_statuses.discard("completed")
    if not normalized_statuses:
        return 0
    unsupported = normalized_statuses - SUPPORTED_EMBEDDING_JOB_STATUSES
    if unsupported:
        raise ValueError(f"Unsupported embedding job status: {sorted(unsupported)[0]}")
    now = _utc_now_sql()
    placeholders = ",".join("?" for _ in normalized_statuses)
    with get_connection() as connection:
        result = connection.execute(
            f"""
            UPDATE embedding_jobs
            SET status = 'pending',
                last_error = '',
                last_error_type = '',
                next_retry_at = '',
                lease_expires_at = '',
                completed_at = '',
                updated_at = ?
            WHERE operation_id = ?
              AND status IN ({placeholders})
              AND status != 'completed'
              AND last_error_type != 'superseded_content_hash'
            """,
            [now, normalized_operation_id, *sorted(normalized_statuses)],
        )
    return int(result.rowcount or 0)


def reset_blocked_embedding_jobs_for_model(model_ref: str) -> int:
    return int(_reset_blocked_embedding_jobs_for_model(model_ref)["count"])


def _reset_blocked_embedding_jobs_for_model(model_ref: str) -> dict[str, Any]:
    model = resolve_embedding_model(model_ref)
    model_id = str(model["embedding_model_id"] or "")
    now = _utc_now_sql()
    with get_connection() as connection:
        operation_rows = connection.execute(
            f"""
            SELECT DISTINCT j.operation_id
            FROM embedding_jobs AS j
            WHERE j.embedding_model_id = ?
              AND j.status = 'blocked'
              AND j.last_error_type = 'embedding_dimension_mismatch'
              AND j.operation_id != ''
              AND {_not_paused_operation_sql("j")}
              AND EXISTS (
                SELECT 1
                FROM retrieval_chunks AS c
                WHERE c.chunk_id = j.chunk_id
                  AND c.content_hash = j.content_hash
              )
            """,
            (model_id,),
        ).fetchall()
        result = connection.execute(
            f"""
            UPDATE embedding_jobs AS j
            SET status = 'pending',
                last_error = '',
                last_error_type = '',
                next_retry_at = '',
                lease_expires_at = '',
                completed_at = '',
                updated_at = ?
            WHERE j.embedding_model_id = ?
              AND j.status = 'blocked'
              AND j.last_error_type = 'embedding_dimension_mismatch'
              AND {_not_paused_operation_sql("j")}
              AND EXISTS (
                SELECT 1
                FROM retrieval_chunks AS c
                WHERE c.chunk_id = j.chunk_id
                  AND c.content_hash = j.content_hash
              )
            """,
            (now, model_id),
        )
    return {
        "count": int(result.rowcount or 0),
        "operation_ids": {
            str(row["operation_id"] or "").strip()
            for row in operation_rows
            if str(row["operation_id"] or "").strip()
        },
    }


def _claim_embedding_job(job_id: str, *, now: str | None = None) -> dict[str, Any] | None:
    normalized_job_id = str(job_id or "").strip()
    normalized_now = str(now or "").strip() or _utc_now_sql()
    lease_expires_at = _lease_expires_at()
    with get_connection() as connection:
        result = connection.execute(
            f"""
            UPDATE embedding_jobs
            SET status = 'running',
                attempt_count = attempt_count + 1,
                last_error = '',
                last_error_type = '',
                next_retry_at = '',
                lease_expires_at = ?,
                updated_at = ?,
                completed_at = ''
            WHERE job_id = ?
              AND (
                status = 'pending'
                OR (status = 'retry_wait' AND next_retry_at != '' AND next_retry_at <= ?)
              )
              AND {_not_paused_operation_sql("embedding_jobs")}
            """,
            (lease_expires_at, normalized_now, normalized_job_id, normalized_now),
        )
        if int(result.rowcount or 0) <= 0:
            return None
        row = connection.execute("SELECT * FROM embedding_jobs WHERE job_id = ?", (normalized_job_id,)).fetchone()
    return _job_from_row(row) if row is not None else None


def classify_embedding_processing_error(exc: Exception) -> dict[str, Any]:
    message = str(exc or "")
    lowered = message.lower()
    if (
        isinstance(exc, ConnectionRefusedError)
        or "connection refused" in lowered
        or "actively refused" in lowered
        or "provider unavailable" in lowered
    ):
        return {"status": "retry_wait", "error_type": "provider_unavailable", "retryable": True}
    if isinstance(exc, TimeoutError) or "timeout" in lowered or "timed out" in lowered:
        return {"status": "retry_wait", "error_type": "provider_timeout", "retryable": True}
    if "expected" in lowered and "dimensions" in lowered and "got" in lowered:
        return {"status": "blocked", "error_type": "embedding_dimension_mismatch", "retryable": False}
    if (
        "does not exist" in lowered
        or "not configured" in lowered
        or "disabled" in lowered
        or "model unavailable" in lowered
        or "embedding model unavailable" in lowered
        or "model is unavailable" in lowered
    ):
        return {"status": "blocked", "error_type": "embedding_model_unavailable", "retryable": False}
    return {"status": "failed", "error_type": "embedding_job_failed", "retryable": False}


def process_pending_embedding_jobs(
    model_ref: str = "",
    limit: int = 50,
    retry_failed: bool = False,
    *,
    collection_id: str = "",
    operation_id: str = "",
    source_kind: str = "",
    source_id: str = "",
    time_budget_seconds: int = 0,
    include_retry_wait: bool = False,
) -> dict[str, Any]:
    normalized_limit = _bounded_int(limit, default=50, minimum=1, maximum=500)
    normalized_collection_id = str(collection_id or "").strip()
    normalized_operation_id = str(operation_id or "").strip()
    normalized_source_kind = str(source_kind or "").strip()
    normalized_source_id = str(source_id or "").strip()
    normalized_time_budget_seconds = _bounded_int(time_budget_seconds, default=0, minimum=0, maximum=86_400)
    now = _utc_now_sql()
    if normalized_operation_id and _knowledge_indexing_operation_is_paused(normalized_operation_id):
        return _paused_embedding_operation_report(
            collection_id=normalized_collection_id,
            operation_id=normalized_operation_id,
            source_kind=normalized_source_kind,
            source_id=normalized_source_id,
            now=now,
        )
    model_id = resolve_embedding_model(model_ref)["embedding_model_id"] if str(model_ref or "").strip() else ""
    scoped_drain = bool(
        normalized_collection_id
        or normalized_operation_id
        or normalized_source_kind
        or normalized_source_id
        or normalized_time_budget_seconds
    )
    retry_wait_enabled = bool(include_retry_wait) or not scoped_drain
    reset_stale_running_embedding_jobs(
        model_id=model_id,
        collection_id=normalized_collection_id,
        operation_id=normalized_operation_id,
        source_kind=normalized_source_kind,
        source_id=normalized_source_id,
        now=now,
    )
    retried_failed_count = _reset_failed_embedding_jobs(
        model_id=model_id,
        collection_id=normalized_collection_id,
        operation_id=normalized_operation_id,
        source_kind=normalized_source_kind,
        source_id=normalized_source_id,
        limit=normalized_limit,
    ) if retry_failed else 0
    if retry_wait_enabled:
        status_where = """
        (
            j.status = 'pending'
            OR (j.status = 'retry_wait' AND j.next_retry_at != '' AND j.next_retry_at <= ?)
        )
        """
        params: list[Any] = [now]
    else:
        status_where = "j.status = 'pending'"
        params = []
    clauses = [status_where]
    if model_id:
        clauses.append("j.embedding_model_id = ?")
        params.append(model_id)
    if normalized_operation_id:
        clauses.append("j.operation_id = ?")
        params.append(normalized_operation_id)
    if normalized_source_kind:
        clauses.append("j.source_kind = ?")
        params.append(normalized_source_kind)
    if normalized_source_id:
        clauses.append("j.source_id = ?")
        params.append(normalized_source_id)
    if normalized_collection_id:
        clauses.append("d.scope_json LIKE ? ESCAPE '\\'")
        params.append(_collection_scope_like_pattern(normalized_collection_id))
    where = f"WHERE {' AND '.join(clauses)}"
    deadline = (
        time.monotonic() + max(0, int(normalized_time_budget_seconds or 0))
        if normalized_time_budget_seconds
        else 0
    )
    rows = _select_embedding_job_candidate_rows(
        where=where,
        params=params,
        collection_id=normalized_collection_id,
        limit=normalized_limit,
        deadline=deadline,
    )

    processed_jobs: list[dict[str, Any]] = []
    probed_dimension_model_ids: set[str] = set()
    for row in rows:
        if deadline and time.monotonic() >= deadline:
            break
        job_id = str(row["job_id"] or "")
        claimed = _claim_embedding_job(job_id, now=now)
        if claimed is None:
            continue
        try:
            provider_key = str(row["provider_key"] or "")
            model_name = str(row["model"] or "")
            content = str(row["content"] or "")
            model = resolve_embedding_model(str(row["embedding_model_id"] or ""))
            dimensions = int(model["dimensions"] or 0)
            should_probe_dimensions = _should_probe_default_embedding_dimensions(model)
            vector, embedding_meta = embed_text_with_model_ref(
                model_ref=f"{provider_key}/{model_name}",
                text=content,
                dimensions=None if should_probe_dimensions else dimensions,
            )
            if should_probe_dimensions:
                updated_model = maybe_update_default_embedding_dimensions(model, vector)
                if (
                    dict(updated_model.get("metadata") or {}).get("dimensions_source") == "provider_probe"
                    and int(updated_model["dimensions"] or 0) != dimensions
                ):
                    probed_dimension_model_ids.add(str(updated_model["embedding_model_id"] or ""))
            vector_record = upsert_embedding_vector(
                str(row["chunk_id"] or ""),
                str(row["embedding_model_id"] or ""),
                vector,
                str(row["chunk_content_hash"] or row["content_hash"] or ""),
            )
            completed = update_embedding_job_status(job_id, "completed")
            processed_jobs.append(
                {
                    "job_id": job_id,
                    "status": completed["status"],
                    "chunk_id": str(row["chunk_id"] or ""),
                    "operation_id": str(row["operation_id"] or ""),
                    "source_kind": str(row["source_kind"] or ""),
                    "source_id": str(row["source_id"] or ""),
                    "embedding_id": vector_record["embedding_id"],
                    "embedding_model_id": str(row["embedding_model_id"] or ""),
                    "embedding_meta": embedding_meta,
                }
            )
        except Exception as exc:
            classification = classify_embedding_processing_error(exc)
            failed = update_embedding_job_status(
                job_id,
                str(classification["status"]),
                error=str(exc),
                error_type=str(classification["error_type"]),
                next_retry_at=_retry_at(minutes=5) if classification["status"] == "retry_wait" else "",
            )
            processed_jobs.append(
                {
                    "job_id": job_id,
                    "status": failed["status"],
                    "chunk_id": str(row["chunk_id"] or ""),
                    "operation_id": str(row["operation_id"] or ""),
                    "source_kind": str(row["source_kind"] or ""),
                    "source_id": str(row["source_id"] or ""),
                    "embedding_model_id": str(row["embedding_model_id"] or ""),
                    "error": str(exc),
                }
            )

    reset_blocked_dimension_mismatch_count = 0
    reset_blocked_operation_ids: set[str] = set()
    for probed_model_id in sorted(probed_dimension_model_ids):
        if not probed_model_id:
            continue
        reset_report = _reset_blocked_embedding_jobs_for_model(probed_model_id)
        reset_blocked_dimension_mismatch_count += int(reset_report["count"])
        reset_blocked_operation_ids.update(str(operation_id or "").strip() for operation_id in reset_report["operation_ids"])
    remaining_count = _count_remaining_embedding_jobs(
        model_id=model_id,
        collection_id=normalized_collection_id,
        operation_id=normalized_operation_id,
        source_kind=normalized_source_kind,
        source_id=normalized_source_id,
        now=now,
        include_retry_wait=retry_wait_enabled,
    )
    completed_count = sum(1 for job in processed_jobs if job.get("status") == "completed")
    failed_count = sum(1 for job in processed_jobs if job.get("status") == "failed")
    retry_wait_count = sum(1 for job in processed_jobs if job.get("status") == "retry_wait")
    blocked_count = sum(1 for job in processed_jobs if job.get("status") == "blocked")
    status = "blocked" if blocked_count else ("paused_retrying" if retry_wait_count else ("failed" if failed_count else "succeeded"))
    error = f"{failed_count} embedding job(s) failed." if failed_count else ""
    operation_ids_to_sync = {
        str(job.get("operation_id") or "").strip()
        for job in processed_jobs
        if str(job.get("operation_id") or "").strip()
    }
    if normalized_operation_id:
        operation_ids_to_sync.add(normalized_operation_id)
    operation_ids_to_sync.update(operation_id for operation_id in reset_blocked_operation_ids if operation_id)
    for operation_id_to_sync in sorted(operation_ids_to_sync):
        _sync_knowledge_operation_status_after_embedding_processing(operation_id_to_sync)
    return {
        "status": status,
        **({"error": error} if error else {}),
        "processed_count": len(processed_jobs),
        "completed_count": completed_count,
        "failed_count": failed_count,
        "retry_wait_count": retry_wait_count,
        "blocked_count": blocked_count,
        "retried_failed_count": retried_failed_count,
        "reset_blocked_dimension_mismatch_count": reset_blocked_dimension_mismatch_count,
        "remaining_count": remaining_count,
        "scope": {
            "collection_id": normalized_collection_id,
            "operation_id": normalized_operation_id,
            "source_kind": normalized_source_kind,
            "source_id": normalized_source_id,
        },
        "processed_jobs": processed_jobs,
    }


def _knowledge_indexing_operation_is_paused(operation_id: str) -> bool:
    normalized_operation_id = str(operation_id or "").strip()
    if not normalized_operation_id:
        return False
    with get_connection() as connection:
        row = connection.execute(
            "SELECT status FROM knowledge_indexing_operations WHERE operation_id = ?",
            (normalized_operation_id,),
        ).fetchone()
    return row is not None and str(row["status"] or "") == "paused"


def _paused_embedding_operation_report(
    *,
    collection_id: str,
    operation_id: str,
    source_kind: str,
    source_id: str,
    now: str,
) -> dict[str, Any]:
    remaining_count = _count_remaining_embedding_jobs(
        model_id="",
        collection_id=collection_id,
        operation_id=operation_id,
        source_kind=source_kind,
        source_id=source_id,
        now=now,
        include_retry_wait=True,
        include_paused_operations=True,
    )
    return {
        "status": "paused",
        "error": "",
        "processed_count": 0,
        "completed_count": 0,
        "failed_count": 0,
        "retry_wait_count": 0,
        "blocked_count": 0,
        "retried_failed_count": 0,
        "reset_blocked_dimension_mismatch_count": 0,
        "remaining_count": remaining_count,
        "scope": {
            "collection_id": collection_id,
            "operation_id": operation_id,
            "source_kind": source_kind,
            "source_id": source_id,
        },
        "processed_jobs": [],
    }


def _sync_knowledge_operation_status_after_embedding_processing(operation_id: str) -> None:
    normalized_operation_id = str(operation_id or "").strip()
    if not normalized_operation_id:
        return
    now = _utc_now_sql()
    with get_connection() as connection:
        operation_row = connection.execute(
            "SELECT status FROM knowledge_indexing_operations WHERE operation_id = ?",
            (normalized_operation_id,),
        ).fetchone()
        if operation_row is None or str(operation_row["status"] or "") == "paused":
            return
        count_rows = connection.execute(
            """
            SELECT j.status, COUNT(*) AS job_count
            FROM embedding_jobs AS j
            JOIN retrieval_chunks AS c
              ON c.chunk_id = j.chunk_id
             AND c.content_hash = j.content_hash
            WHERE j.operation_id = ?
            GROUP BY j.status
            """,
            (normalized_operation_id,),
        ).fetchall()
        status_counts = {str(row["status"] or ""): int(row["job_count"] or 0) for row in count_rows}
        error_row = connection.execute(
            """
            SELECT j.last_error_type, j.last_error
            FROM embedding_jobs AS j
            JOIN retrieval_chunks AS c
              ON c.chunk_id = j.chunk_id
             AND c.content_hash = j.content_hash
            WHERE j.operation_id = ?
              AND j.status IN ('retry_wait', 'failed', 'blocked')
              AND (j.last_error_type != '' OR j.last_error != '')
            ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC
            LIMIT 1
            """,
            (normalized_operation_id,),
        ).fetchone()
        next_retry_row = connection.execute(
            """
            SELECT j.next_retry_at
            FROM embedding_jobs AS j
            JOIN retrieval_chunks AS c
              ON c.chunk_id = j.chunk_id
             AND c.content_hash = j.content_hash
            WHERE j.operation_id = ?
              AND j.status = 'retry_wait'
              AND j.next_retry_at != ''
            ORDER BY j.next_retry_at ASC
            LIMIT 1
            """,
            (normalized_operation_id,),
        ).fetchone()

        pending_or_running = int(status_counts.get("pending", 0)) + int(status_counts.get("running", 0))
        retry_wait = int(status_counts.get("retry_wait", 0))
        failed = int(status_counts.get("failed", 0))
        blocked = int(status_counts.get("blocked", 0))
        if blocked > 0:
            next_status = "blocked"
            next_stage = "embedding_blocked"
            completed_at = ""
        elif retry_wait > 0:
            next_status = "retrying"
            next_stage = "embedding_retry_wait"
            completed_at = ""
        elif failed > 0:
            next_status = "failed"
            next_stage = "embedding_failed"
            completed_at = ""
        elif pending_or_running > 0:
            next_status = "embedding"
            next_stage = "embedding_pending"
            completed_at = ""
        else:
            next_status = "completed"
            next_stage = "embedding_completed"
            completed_at = now

        connection.execute(
            """
            UPDATE knowledge_indexing_operations
            SET status = ?,
                stage = ?,
                last_error_type = ?,
                last_error = ?,
                next_retry_at = ?,
                completed_at = ?,
                updated_at = ?
            WHERE operation_id = ?
            """,
            (
                next_status,
                next_stage,
                str(error_row["last_error_type"] or "") if error_row is not None else "",
                str(error_row["last_error"] or "") if error_row is not None else "",
                str(next_retry_row["next_retry_at"] or "") if next_retry_row is not None else "",
                completed_at,
                now,
                normalized_operation_id,
            ),
        )


def _count_remaining_embedding_jobs(
    *,
    model_id: str = "",
    collection_id: str = "",
    operation_id: str = "",
    source_kind: str = "",
    source_id: str = "",
    now: str,
    include_retry_wait: bool,
    include_paused_operations: bool = False,
) -> int:
    if include_retry_wait:
        status_where = """
        (
            j.status = 'pending'
            OR (j.status = 'retry_wait' AND j.next_retry_at != '' AND j.next_retry_at <= ?)
        )
        """
        params: list[Any] = [now]
    else:
        status_where = "j.status = 'pending'"
        params = []
    clauses = [status_where]
    if model_id:
        clauses.append("j.embedding_model_id = ?")
        params.append(model_id)
    if operation_id:
        clauses.append("j.operation_id = ?")
        params.append(operation_id)
    if source_kind:
        clauses.append("j.source_kind = ?")
        params.append(source_kind)
    if source_id:
        clauses.append("j.source_id = ?")
        params.append(source_id)
    if collection_id:
        clauses.append("d.scope_json LIKE ? ESCAPE '\\'")
        params.append(_collection_scope_like_pattern(collection_id))
    if not include_paused_operations:
        clauses.append(_not_paused_operation_sql("j"))
    where = f"WHERE {' AND '.join(clauses)}"
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT d.scope_json
            FROM embedding_jobs AS j
            JOIN retrieval_chunks AS c ON c.chunk_id = j.chunk_id
                AND c.content_hash = j.content_hash
            JOIN retrieval_documents AS d ON d.document_id = c.document_id
            {where}
            """,
            params,
        ).fetchall()
    return len(_filter_embedding_job_rows_by_collection(rows, collection_id))


def _not_paused_operation_sql(job_alias: str) -> str:
    alias = str(job_alias or "j").strip() or "j"
    return (
        "NOT EXISTS ("
        "SELECT 1 FROM knowledge_indexing_operations AS kop "
        f"WHERE kop.operation_id = {alias}.operation_id "
        "AND kop.status = 'paused'"
        ")"
    )


def _select_embedding_job_candidate_rows(
    *,
    where: str,
    params: list[Any],
    collection_id: str,
    limit: int,
    deadline: float,
) -> list[Any]:
    normalized_limit = _bounded_int(limit, default=50, minimum=1, maximum=500)
    page_size = min(max(normalized_limit, EMBEDDING_JOB_SCAN_PAGE_SIZE), 500)
    rows: list[Any] = []
    offset = 0
    with get_connection() as connection:
        while len(rows) < normalized_limit:
            if deadline and time.monotonic() >= deadline:
                break
            candidate_rows = connection.execute(
                f"""
                SELECT
                    j.*,
                    c.content,
                    c.content_hash AS chunk_content_hash,
                    d.scope_json,
                    m.provider_key,
                    m.model,
                    m.dimensions
                FROM embedding_jobs AS j
                JOIN retrieval_chunks AS c ON c.chunk_id = j.chunk_id
                    AND c.content_hash = j.content_hash
                JOIN retrieval_documents AS d ON d.document_id = c.document_id
                JOIN embedding_models AS m ON m.embedding_model_id = j.embedding_model_id
                {where}
                AND {_not_paused_operation_sql("j")}
                ORDER BY j.priority ASC, j.created_at ASC, j.job_id ASC
                LIMIT ? OFFSET ?
                """,
                [*params, page_size, offset],
            ).fetchall()
            if not candidate_rows:
                break
            rows.extend(
                _filter_embedding_job_rows_by_collection(candidate_rows, collection_id)[
                    : normalized_limit - len(rows)
                ]
            )
            if len(candidate_rows) < page_size:
                break
            offset += page_size
    return rows


def _filter_embedding_job_rows_by_collection(rows: list[Any], collection_id: str) -> list[Any]:
    normalized_collection_id = str(collection_id or "").strip()
    if not normalized_collection_id:
        return list(rows)
    return [
        row
        for row in rows
        if _json_loads(row["scope_json"], {}).get("collection") == normalized_collection_id
    ]


def reset_stale_running_embedding_jobs(
    *,
    model_id: str = "",
    collection_id: str = "",
    operation_id: str = "",
    source_kind: str = "",
    source_id: str = "",
    now: str | None = None,
) -> int:
    normalized_model_id = str(model_id or "").strip()
    normalized_collection_id = str(collection_id or "").strip()
    normalized_operation_id = str(operation_id or "").strip()
    normalized_source_kind = str(source_kind or "").strip()
    normalized_source_id = str(source_id or "").strip()
    normalized_now = str(now or "").strip() or _utc_now_sql()
    where = "WHERE j.status = 'running' AND j.lease_expires_at != '' AND j.lease_expires_at <= ?"
    params: list[Any] = [normalized_now]
    if normalized_model_id:
        where += " AND j.embedding_model_id = ?"
        params.append(normalized_model_id)
    if normalized_operation_id:
        where += " AND j.operation_id = ?"
        params.append(normalized_operation_id)
    if normalized_source_kind:
        where += " AND j.source_kind = ?"
        params.append(normalized_source_kind)
    if normalized_source_id:
        where += " AND j.source_id = ?"
        params.append(normalized_source_id)
    if normalized_collection_id:
        where += " AND d.scope_json LIKE ? ESCAPE '\\'"
        params.append(_collection_scope_like_pattern(normalized_collection_id))
    where += f" AND {_not_paused_operation_sql('j')}"
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT j.job_id, d.scope_json
            FROM embedding_jobs AS j
            JOIN retrieval_chunks AS c ON c.chunk_id = j.chunk_id
                AND c.content_hash = j.content_hash
            JOIN retrieval_documents AS d ON d.document_id = c.document_id
            {where}
            """,
            params,
        ).fetchall()
        job_ids = [
            str(row["job_id"] or "").strip()
            for row in _filter_embedding_job_rows_by_collection(rows, normalized_collection_id)
            if str(row["job_id"] or "").strip()
        ]
        if not job_ids:
            return 0
        placeholders = ",".join("?" for _ in job_ids)
        result = connection.execute(
            f"""
            UPDATE embedding_jobs
            SET status = 'pending',
                last_error = '',
                last_error_type = '',
                next_retry_at = '',
                lease_expires_at = '',
                updated_at = ?
            WHERE job_id IN ({placeholders})
            """,
            [normalized_now, *job_ids],
        )
    return int(result.rowcount or 0)


def _reset_failed_embedding_jobs(
    *,
    model_id: str = "",
    collection_id: str = "",
    operation_id: str = "",
    source_kind: str = "",
    source_id: str = "",
    limit: int = 50,
) -> int:
    normalized_limit = _bounded_int(limit, default=50, minimum=1, maximum=500)
    normalized_collection_id = str(collection_id or "").strip()
    normalized_operation_id = str(operation_id or "").strip()
    normalized_source_kind = str(source_kind or "").strip()
    normalized_source_id = str(source_id or "").strip()
    where = "WHERE j.status = 'failed' AND j.last_error_type != 'superseded_content_hash'"
    params: list[Any] = []
    if model_id:
        where += " AND j.embedding_model_id = ?"
        params.append(model_id)
    if normalized_operation_id:
        where += " AND j.operation_id = ?"
        params.append(normalized_operation_id)
    if normalized_source_kind:
        where += " AND j.source_kind = ?"
        params.append(normalized_source_kind)
    if normalized_source_id:
        where += " AND j.source_id = ?"
        params.append(normalized_source_id)
    if normalized_collection_id:
        where += " AND d.scope_json LIKE ? ESCAPE '\\'"
        params.append(_collection_scope_like_pattern(normalized_collection_id))
    where += f" AND {_not_paused_operation_sql('j')}"
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT j.job_id, d.scope_json
            FROM embedding_jobs AS j
            JOIN retrieval_chunks AS c ON c.chunk_id = j.chunk_id
                AND c.content_hash = j.content_hash
            JOIN retrieval_documents AS d ON d.document_id = c.document_id
            {where}
            ORDER BY j.updated_at ASC, j.job_id ASC
            """,
            params,
        ).fetchall()
        job_ids = [
            str(row["job_id"] or "").strip()
            for row in _filter_embedding_job_rows_by_collection(rows, normalized_collection_id)[:normalized_limit]
            if str(row["job_id"] or "").strip()
        ]
        if not job_ids:
            return 0
        now = _utc_now_sql()
        placeholders = ",".join("?" for _ in job_ids)
        connection.execute(
            f"""
            UPDATE embedding_jobs
            SET status = 'pending',
                last_error = '',
                last_error_type = '',
                next_retry_at = '',
                lease_expires_at = '',
                completed_at = '',
                updated_at = ?
            WHERE job_id IN ({placeholders})
            """,
            [now, *job_ids],
        )
    return len(job_ids)


def maybe_update_default_embedding_dimensions(model: dict[str, Any], vector: list[float]) -> dict[str, Any]:
    metadata = dict(model.get("metadata") or {})
    if metadata.get("dimensions_source") != "default":
        return model
    actual_dimensions = len(vector) if isinstance(vector, list) else 0
    if actual_dimensions <= 0:
        return model
    model_id = str(model.get("embedding_model_id") or "").strip()
    if not model_id or _embedding_model_has_vectors(model_id):
        return model
    return register_embedding_model(
        provider_key=str(model["provider_key"]),
        model=str(model["model"]),
        dimensions=actual_dimensions,
        distance_metric=str(model["distance_metric"]),
        vector_format=str(model["vector_format"]),
        enabled=bool(model["enabled"]),
        metadata={**metadata, "dimensions_source": "provider_probe"},
        embedding_model_id=model_id,
    )


def _should_probe_default_embedding_dimensions(model: dict[str, Any]) -> bool:
    metadata = dict(model.get("metadata") or {})
    model_id = str(model.get("embedding_model_id") or "").strip()
    return bool(
        metadata.get("dimensions_source") == "default"
        and model_id
        and not _embedding_model_has_vectors(model_id)
    )


def _embedding_model_has_vectors(embedding_model_id: str) -> bool:
    normalized_model_id = str(embedding_model_id or "").strip()
    if not normalized_model_id:
        return False
    with get_connection() as connection:
        row = connection.execute(
            "SELECT 1 FROM embedding_vectors WHERE embedding_model_id = ? LIMIT 1",
            (normalized_model_id,),
        ).fetchone()
    return row is not None


def upsert_embedding_vector(
    chunk_id: str,
    model_ref: str,
    vector: list[float],
    content_hash: str,
) -> dict[str, Any]:
    normalized_chunk_id = str(chunk_id or "").strip()
    if not normalized_chunk_id:
        raise ValueError("chunk_id is required.")
    model = resolve_embedding_model(model_ref)
    normalized_vector = _normalize_vector(vector, dimensions=int(model["dimensions"]))
    normalized_content_hash = str(content_hash or "").strip()
    if not normalized_content_hash:
        raise ValueError("content_hash is required.")
    embedding_id = _embedding_id(
        normalized_chunk_id,
        model["embedding_model_id"],
        normalized_content_hash,
    )
    now = _utc_now_sql()
    with get_connection() as connection:
        chunk = connection.execute(
            "SELECT chunk_id FROM retrieval_chunks WHERE chunk_id = ?",
            (normalized_chunk_id,),
        ).fetchone()
        if chunk is None:
            raise FileNotFoundError(f"Retrieval chunk '{normalized_chunk_id}' does not exist.")
        connection.execute(
            """
            INSERT INTO embedding_vectors (
                embedding_id,
                chunk_id,
                embedding_model_id,
                provider_key,
                model,
                dimensions,
                distance_metric,
                vector_json,
                content_hash,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(chunk_id, embedding_model_id, content_hash) DO UPDATE SET
                vector_json = excluded.vector_json,
                updated_at = excluded.updated_at
            """,
            (
                embedding_id,
                normalized_chunk_id,
                model["embedding_model_id"],
                model["provider_key"],
                model["model"],
                model["dimensions"],
                model["distance_metric"],
                _json_dumps(normalized_vector),
                normalized_content_hash,
                now,
                now,
            ),
        )
        row = connection.execute("SELECT * FROM embedding_vectors WHERE embedding_id = ?", (embedding_id,)).fetchone()
    return _vector_from_row(row)


def search_embedding_vectors(
    query_vector: list[float],
    filters: dict[str, Any] | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    resolved_filters = _coerce_dict(filters)
    normalized_limit = _bounded_int(limit, default=10, minimum=1, maximum=100)
    model_ref = str(resolved_filters.get("embedding_model_ref") or resolved_filters.get("model_ref") or "").strip()
    model_id = resolve_embedding_model(model_ref)["embedding_model_id"] if model_ref else ""
    where_sql, params = _vector_filter_sql(resolved_filters, model_id=model_id)
    metadata_filter = _coerce_dict(
        resolved_filters.get("metadata_filter")
        if isinstance(resolved_filters.get("metadata_filter"), dict)
        else resolved_filters.get("metadata")
    )
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT
                ev.*,
                c.document_id,
                c.source_kind,
                c.source_id,
                c.source_locator_json,
                c.content,
                c.metadata_json,
                c.updated_at,
                d.source_revision_id,
                d.title
            FROM embedding_vectors AS ev
            JOIN retrieval_chunks AS c ON c.chunk_id = ev.chunk_id
                AND c.content_hash = ev.content_hash
            JOIN retrieval_documents AS d ON d.document_id = c.document_id
            {where_sql}
            """,
            params,
        ).fetchall()
    query = _normalize_query_vector(query_vector)
    ranked: list[dict[str, Any]] = []
    for row in rows:
        result = _vector_search_result_from_row(row, query)
        if metadata_filter and not _metadata_matches(result["metadata"], metadata_filter):
            continue
        ranked.append(result)
    ranked.sort(key=lambda item: (-float(item["score"]), str(item["chunk_id"])))
    return ranked[:normalized_limit]


def _vector_search_result_from_row(row: Any, query_vector: list[float]) -> dict[str, Any]:
    stored_vector = _json_loads(row["vector_json"], [])
    vector_score = _cosine_similarity(query_vector, _normalize_query_vector(stored_vector))
    metadata = _json_loads(row["metadata_json"], {})
    source_locator = _json_loads(row["source_locator_json"], {})
    source_ref = {
        "source_kind": str(row["source_kind"] or ""),
        "source_id": str(row["source_id"] or ""),
        "source_revision_id": str(row["source_revision_id"] or ""),
        "source_locator": source_locator,
    }
    return {
        "embedding_id": str(row["embedding_id"] or ""),
        "chunk_id": str(row["chunk_id"] or ""),
        "document_id": str(row["document_id"] or ""),
        "title": str(row["title"] or ""),
        "content": str(row["content"] or ""),
        "updated_at": str(row["updated_at"] or ""),
        "score": float(vector_score),
        "source_ref": source_ref,
        "metadata": metadata,
        "retrieval": {
            "mode": "vector",
            "score": float(vector_score),
            "vector_score": float(vector_score),
        },
    }


def _vector_filter_sql(filters: dict[str, Any], *, model_id: str) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    if model_id:
        clauses.append("ev.embedding_model_id = ?")
        params.append(model_id)
    for key in ("source_kind", "source_id", "document_id", "chunk_id"):
        value = str(filters.get(key) or "").strip()
        if not value:
            continue
        table_alias = "c"
        clauses.append(f"{table_alias}.{key} = ?")
        params.append(value)
    if not clauses:
        return "", []
    return f"WHERE {' AND '.join(clauses)}", params


def _model_from_row(row: Any) -> dict[str, Any]:
    if row is None:
        raise FileNotFoundError("Embedding model does not exist.")
    payload = dict(row)
    payload["enabled"] = bool(payload.get("enabled"))
    payload["metadata"] = _json_loads(payload.get("metadata_json"), {})
    payload["model_ref"] = payload["embedding_model_id"]
    return payload


def _vector_from_row(row: Any) -> dict[str, Any]:
    if row is None:
        raise FileNotFoundError("Embedding vector does not exist.")
    payload = dict(row)
    payload["vector"] = _json_loads(payload.get("vector_json"), [])
    return payload


def _job_from_row(row: Any) -> dict[str, Any]:
    if row is None:
        raise FileNotFoundError("Embedding job does not exist.")
    return dict(row)


def _normalize_label(value: str, *, field_name: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        raise ValueError(f"{field_name} is required.")
    return normalized


def _normalize_distance_metric(value: str) -> str:
    normalized = str(value or DEFAULT_DISTANCE_METRIC).strip().lower()
    if normalized != DEFAULT_DISTANCE_METRIC:
        raise ValueError(f"Unsupported embedding distance metric: {normalized}")
    return normalized


def _normalize_vector(vector: list[float], *, dimensions: int) -> list[float]:
    if not isinstance(vector, list):
        raise ValueError("vector must be a list of numbers.")
    normalized = [float(value) for value in vector]
    if len(normalized) != dimensions:
        raise ValueError(f"Expected {dimensions} dimensions, got {len(normalized)}.")
    return normalized


def _normalize_query_vector(vector: Any) -> list[float]:
    return [float(value) for value in vector] if isinstance(vector, list) else []


def _cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if not left_norm or not right_norm:
        return 0.0
    return sum(a * b for a, b in zip(left, right, strict=False)) / (left_norm * right_norm)


def _metadata_matches(metadata: dict[str, Any], filters: dict[str, Any]) -> bool:
    for key, expected in filters.items():
        if metadata.get(key) != expected:
            return False
    return True


def _embedding_model_id(provider_key: str, model: str) -> str:
    return f"emodel_{_short_hash([provider_key, model])}"


def _embedding_id(chunk_id: str, embedding_model_id: str, content_hash: str) -> str:
    return f"emb_{_short_hash([chunk_id, embedding_model_id, content_hash])}"


def _embedding_job_id(chunk_id: str, embedding_model_id: str, content_hash: str) -> str:
    return f"ejob_{_short_hash([chunk_id, embedding_model_id, content_hash])}"


def _short_hash(parts: list[str]) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:20]


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return min(max(parsed, minimum), maximum)


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _collection_scope_like_pattern(collection_id: str) -> str:
    return f'%\"collection\"%{_escape_like_value(collection_id)}%'


def _escape_like_value(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _json_loads(value: Any, fallback: Any) -> Any:
    if not isinstance(value, str):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _lease_expires_at() -> str:
    return _utc_at(timedelta(minutes=EMBEDDING_JOB_LEASE_MINUTES))


def _retry_at(*, minutes: int) -> str:
    return _utc_at(timedelta(minutes=minutes))


def _utc_at(delta: timedelta) -> str:
    return (datetime.now(UTC) + delta).isoformat().replace("+00:00", "Z")


def _utc_now_sql() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")

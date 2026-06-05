from __future__ import annotations

import hashlib
import json
import math
from typing import Any

from app.core.storage.database import get_connection
from app.tools.model_provider_client import embed_text_with_model_ref


SUPPORTED_EMBEDDING_JOB_STATUSES = {"pending", "running", "completed", "failed"}
DEFAULT_DISTANCE_METRIC = "cosine"
DEFAULT_VECTOR_FORMAT = "json"


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


def queue_embedding_job(source_kind: str, source_id: str, model_ref: str) -> list[dict[str, Any]]:
    model = resolve_embedding_model(model_ref)
    normalized_source_kind = str(source_kind or "").strip()
    normalized_source_id = str(source_id or "").strip()
    if not normalized_source_kind or not normalized_source_id:
        raise ValueError("source_kind and source_id are required.")
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
                    updated_at = ?,
                    completed_at = ?
                WHERE chunk_id = ?
                  AND embedding_model_id = ?
                  AND content_hash != ?
                  AND status IN ('pending', 'running')
                """,
                (
                    now,
                    now,
                    str(row["chunk_id"]),
                    model["embedding_model_id"],
                    str(row["content_hash"]),
                ),
            )
            connection.execute(
                """
                INSERT INTO embedding_jobs (
                    job_id,
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
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, '', ?, ?, '')
                ON CONFLICT(chunk_id, embedding_model_id, content_hash) DO UPDATE SET
                    source_kind = excluded.source_kind,
                    source_id = excluded.source_id,
                    status = 'pending',
                    last_error = '',
                    updated_at = excluded.updated_at,
                    completed_at = ''
                """,
                (
                    job_id,
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


def update_embedding_job_status(job_id: str, status: str, *, error: str = "") -> dict[str, Any]:
    normalized_job_id = str(job_id or "").strip()
    normalized_status = str(status or "").strip().lower()
    if normalized_status not in SUPPORTED_EMBEDDING_JOB_STATUSES:
        raise ValueError(f"Unsupported embedding job status: {normalized_status}")
    now = _utc_now_sql()
    completed_at = now if normalized_status == "completed" else ""
    attempt_delta = 1 if normalized_status == "running" else 0
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE embedding_jobs
            SET status = ?,
                attempt_count = attempt_count + ?,
                last_error = ?,
                updated_at = ?,
                completed_at = ?
            WHERE job_id = ?
            """,
            (normalized_status, attempt_delta, str(error or ""), now, completed_at, normalized_job_id),
        )
        row = connection.execute("SELECT * FROM embedding_jobs WHERE job_id = ?", (normalized_job_id,)).fetchone()
    if row is None:
        raise FileNotFoundError(f"Embedding job '{normalized_job_id}' does not exist.")
    return _job_from_row(row)


def process_pending_embedding_jobs(model_ref: str = "", limit: int = 50) -> dict[str, Any]:
    normalized_limit = _bounded_int(limit, default=50, minimum=1, maximum=500)
    model_id = resolve_embedding_model(model_ref)["embedding_model_id"] if str(model_ref or "").strip() else ""
    where = "WHERE j.status = 'pending'"
    params: list[Any] = []
    if model_id:
        where += " AND j.embedding_model_id = ?"
        params.append(model_id)
    with get_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT
                j.*,
                c.content,
                c.content_hash AS chunk_content_hash,
                m.provider_key,
                m.model,
                m.dimensions
            FROM embedding_jobs AS j
            JOIN retrieval_chunks AS c ON c.chunk_id = j.chunk_id
            JOIN embedding_models AS m ON m.embedding_model_id = j.embedding_model_id
            {where}
            ORDER BY j.created_at ASC, j.job_id ASC
            LIMIT ?
            """,
            [*params, normalized_limit],
        ).fetchall()

    processed_jobs: list[dict[str, Any]] = []
    for row in rows:
        job_id = str(row["job_id"] or "")
        try:
            update_embedding_job_status(job_id, "running")
            provider_key = str(row["provider_key"] or "")
            model_name = str(row["model"] or "")
            content = str(row["content"] or "")
            dimensions = int(row["dimensions"] or 0)
            vector, embedding_meta = embed_text_with_model_ref(
                model_ref=f"{provider_key}/{model_name}",
                text=content,
                dimensions=dimensions,
            )
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
                    "embedding_id": vector_record["embedding_id"],
                    "embedding_model_id": str(row["embedding_model_id"] or ""),
                    "embedding_meta": embedding_meta,
                }
            )
        except Exception as exc:
            failed = update_embedding_job_status(job_id, "failed", error=str(exc))
            processed_jobs.append(
                {
                    "job_id": job_id,
                    "status": failed["status"],
                    "chunk_id": str(row["chunk_id"] or ""),
                    "embedding_model_id": str(row["embedding_model_id"] or ""),
                    "error": str(exc),
                }
            )

    completed_count = sum(1 for job in processed_jobs if job.get("status") == "completed")
    failed_count = sum(1 for job in processed_jobs if job.get("status") == "failed")
    status = "failed" if failed_count else "succeeded"
    error = f"{failed_count} embedding job(s) failed." if failed_count else ""
    return {
        "status": status,
        **({"error": error} if error else {}),
        "processed_count": len(processed_jobs),
        "completed_count": completed_count,
        "failed_count": failed_count,
        "processed_jobs": processed_jobs,
    }


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


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


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

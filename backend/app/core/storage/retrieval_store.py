from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from typing import Any
from uuid import uuid4

from app.core.storage.database import get_connection


SUPPORTED_RETRIEVAL_SOURCE_KINDS = {
    "buddy_message",
    "graph_output",
    "node_summary",
    "memory_entry",
    "graph_run",
    "retrieval_chunk",
}


def upsert_retrieval_document(
    *,
    source_kind: str,
    source_id: str,
    source_revision_id: str = "",
    title: str = "",
    content: str = "",
    scope: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    document_id: str | None = None,
) -> dict[str, Any]:
    normalized_source_kind = _normalize_source_kind(source_kind)
    normalized_source_id = str(source_id or "").strip()
    if not normalized_source_id:
        raise ValueError("source_id is required.")
    normalized_revision_id = str(source_revision_id or "").strip()
    normalized_document_id = str(document_id or "").strip() or _document_id(
        normalized_source_kind,
        normalized_source_id,
        normalized_revision_id,
    )
    content_hash = _content_hash(content)
    now = _utc_now_sql()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO retrieval_documents (
                document_id,
                source_kind,
                source_id,
                source_revision_id,
                title,
                scope_json,
                metadata_json,
                content_hash,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(document_id) DO UPDATE SET
                source_kind = excluded.source_kind,
                source_id = excluded.source_id,
                source_revision_id = excluded.source_revision_id,
                title = excluded.title,
                scope_json = excluded.scope_json,
                metadata_json = excluded.metadata_json,
                content_hash = excluded.content_hash,
                updated_at = excluded.updated_at
            """,
            (
                normalized_document_id,
                normalized_source_kind,
                normalized_source_id,
                normalized_revision_id,
                str(title or ""),
                _json_dumps(scope or {}),
                _json_dumps(metadata or {}),
                content_hash,
                now,
                now,
            ),
        )
        row = connection.execute(
            "SELECT * FROM retrieval_documents WHERE document_id = ?",
            (normalized_document_id,),
        ).fetchone()
    return _document_from_row(row)


def upsert_retrieval_chunks(document_id: str, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_document_id = str(document_id or "").strip()
    if not normalized_document_id:
        raise ValueError("document_id is required.")
    with get_connection() as connection:
        document = connection.execute(
            "SELECT * FROM retrieval_documents WHERE document_id = ?",
            (normalized_document_id,),
        ).fetchone()
        if document is None:
            raise FileNotFoundError(f"Retrieval document '{normalized_document_id}' does not exist.")
        document_payload = _document_from_row(document)
        upserted: list[dict[str, Any]] = []
        for ordinal, chunk in enumerate(chunks):
            content = str(chunk.get("content") or "")
            chunk_id = str(chunk.get("chunk_id") or "").strip() or _chunk_id(normalized_document_id, ordinal, content)
            source_locator = _coerce_dict(chunk.get("source_locator"))
            metadata = _coerce_dict(chunk.get("metadata"))
            token_estimate = _bounded_int(
                chunk.get("token_estimate"),
                default=_estimate_tokens(content),
                minimum=0,
                maximum=1_000_000,
            )
            now = _utc_now_sql()
            connection.execute(
                """
                INSERT INTO retrieval_chunks (
                    chunk_id,
                    document_id,
                    source_kind,
                    source_id,
                    source_locator_json,
                    ordinal,
                    content,
                    content_hash,
                    token_estimate,
                    metadata_json,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chunk_id) DO UPDATE SET
                    document_id = excluded.document_id,
                    source_kind = excluded.source_kind,
                    source_id = excluded.source_id,
                    source_locator_json = excluded.source_locator_json,
                    ordinal = excluded.ordinal,
                    content = excluded.content,
                    content_hash = excluded.content_hash,
                    token_estimate = excluded.token_estimate,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at
                """,
                (
                    chunk_id,
                    normalized_document_id,
                    document_payload["source_kind"],
                    document_payload["source_id"],
                    _json_dumps(source_locator),
                    _bounded_int(chunk.get("ordinal"), default=ordinal, minimum=0, maximum=1_000_000),
                    content,
                    _content_hash(content),
                    token_estimate,
                    _json_dumps(metadata),
                    now,
                    now,
                ),
            )
            _replace_fts_rows(
                connection,
                chunk_id=chunk_id,
                document_id=normalized_document_id,
                title=document_payload["title"],
                content=content,
            )
            row = connection.execute("SELECT * FROM retrieval_chunks WHERE chunk_id = ?", (chunk_id,)).fetchone()
            upserted.append(_chunk_from_row(row, document_payload))
    return upserted


def search_retrieval_fts(
    query: str,
    filters: dict[str, Any] | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    normalized_query = str(query or "").strip()
    if not normalized_query:
        return []
    normalized_limit = _bounded_int(limit, default=10, minimum=1, maximum=100)
    resolved_filters = _coerce_dict(filters)
    if _contains_cjk(normalized_query):
        cjk_tokens = _query_search_tokens(normalized_query, cjk_only=True)
        if cjk_tokens and all(_count_cjk(token) >= 3 for token in cjk_tokens):
            rows = _search_fts(
                _trigram_query(normalized_query),
                filters=resolved_filters,
                limit=normalized_limit,
                table_name="retrieval_chunks_fts_trigram",
                mode="trigram",
            )
            if rows:
                return rows
        return _search_like(normalized_query, filters=resolved_filters, limit=normalized_limit)

    rows = _search_fts(
        _sanitize_fts5_query(normalized_query),
        filters=resolved_filters,
        limit=normalized_limit,
        table_name="retrieval_chunks_fts",
        mode="fts",
    )
    return rows


def hybrid_search(
    query: str,
    filters: dict[str, Any] | None = None,
    embedding_model_ref: str = "",
    limit: int = 10,
) -> list[dict[str, Any]]:
    from app.core.storage.embedding_store import (
        build_local_text_embedding,
        resolve_embedding_model,
        search_embedding_vectors,
    )

    normalized_query = str(query or "").strip()
    if not normalized_query:
        return []
    normalized_limit = _bounded_int(limit, default=10, minimum=1, maximum=100)
    resolved_filters = _coerce_dict(filters)
    lexical_results = search_retrieval_fts(normalized_query, filters=resolved_filters, limit=normalized_limit * 4)
    vector_results: list[dict[str, Any]] = []
    if str(embedding_model_ref or "").strip():
        model = resolve_embedding_model(embedding_model_ref)
        query_vector = build_local_text_embedding(normalized_query, dimensions=int(model["dimensions"]))
        vector_results = search_embedding_vectors(
            query_vector,
            {**resolved_filters, "embedding_model_ref": model["embedding_model_id"]},
            limit=normalized_limit * 4,
        )

    combined: dict[str, dict[str, Any]] = {}
    for index, result in enumerate(lexical_results):
        chunk_id = str(result.get("chunk_id") or "")
        if not chunk_id:
            continue
        entry = _hybrid_entry(result)
        entry["retrieval"]["lexical_score"] = _rank_score(index)
        combined[chunk_id] = entry
    for result in vector_results:
        chunk_id = str(result.get("chunk_id") or "")
        if not chunk_id:
            continue
        entry = combined.get(chunk_id) or _hybrid_entry(result)
        entry["retrieval"]["vector_score"] = max(
            float(entry["retrieval"].get("vector_score") or 0.0),
            float(result.get("score") or 0.0),
        )
        if not entry.get("snippet"):
            entry["snippet"] = _make_text_snippet(str(entry.get("content") or ""), tokens=_query_search_tokens(normalized_query))
        combined[chunk_id] = entry

    metadata_filter = _coerce_dict(
        resolved_filters.get("metadata_filter")
        if isinstance(resolved_filters.get("metadata_filter"), dict)
        else resolved_filters.get("metadata")
    )
    ranked: list[dict[str, Any]] = []
    for entry in combined.values():
        if metadata_filter and not _metadata_matches(_coerce_dict(entry.get("metadata")), metadata_filter):
            continue
        recency_boost = _bounded_float(_coerce_dict(entry.get("metadata")).get("recency_boost"), default=0.0, minimum=0.0, maximum=1.0)
        lexical_score = float(entry["retrieval"].get("lexical_score") or 0.0)
        vector_score = float(entry["retrieval"].get("vector_score") or 0.0)
        final_score = lexical_score + vector_score + recency_boost
        entry["score"] = final_score
        entry["retrieval"] = {
            **entry["retrieval"],
            "mode": "hybrid",
            "lexical_score": lexical_score,
            "vector_score": vector_score,
            "recency_boost": recency_boost,
            "score": final_score,
        }
        ranked.append(entry)
    ranked.sort(key=lambda item: (-float(item.get("score") or 0.0), str(item.get("chunk_id") or "")))
    results = ranked[:normalized_limit]
    query_id = _record_retrieval_audit(
        query=normalized_query,
        filters=resolved_filters,
        embedding_model_ref=str(embedding_model_ref or ""),
        mode="hybrid",
        results=results,
    )
    for result in results:
        result["retrieval"]["query_id"] = query_id
    return results


def rebuild_retrieval_indexes(scope: dict[str, Any] | None = None) -> dict[str, Any]:
    filters = _coerce_dict(scope)
    where_sql, params = _chunk_filter_sql(filters, table_alias="c")
    with get_connection() as connection:
        if filters:
            chunk_ids = [
                str(row["chunk_id"])
                for row in connection.execute(f"SELECT c.chunk_id FROM retrieval_chunks AS c {where_sql}", params).fetchall()
            ]
            for chunk_id in chunk_ids:
                connection.execute("DELETE FROM retrieval_chunks_fts WHERE chunk_id = ?", (chunk_id,))
                connection.execute("DELETE FROM retrieval_chunks_fts_trigram WHERE chunk_id = ?", (chunk_id,))
        else:
            connection.execute("DELETE FROM retrieval_chunks_fts")
            connection.execute("DELETE FROM retrieval_chunks_fts_trigram")
        rows = connection.execute(
            f"""
            SELECT c.chunk_id, c.document_id, c.content, d.title
            FROM retrieval_chunks AS c
            JOIN retrieval_documents AS d ON d.document_id = c.document_id
            {where_sql}
            ORDER BY c.document_id ASC, c.ordinal ASC
            """,
            params,
        ).fetchall()
        for row in rows:
            _replace_fts_rows(
                connection,
                chunk_id=str(row["chunk_id"]),
                document_id=str(row["document_id"]),
                title=str(row["title"] or ""),
                content=str(row["content"] or ""),
            )
    return {"chunk_count": len(rows)}


def _search_fts(
    match_query: str,
    *,
    filters: dict[str, Any],
    limit: int,
    table_name: str,
    mode: str,
) -> list[dict[str, Any]]:
    if not match_query:
        return []
    if table_name not in {"retrieval_chunks_fts", "retrieval_chunks_fts_trigram"}:
        raise ValueError("Unsupported retrieval FTS table.")
    where_sql, params = _chunk_filter_sql(filters, table_alias="c", prefix="AND")
    sql = f"""
        SELECT
            c.*,
            d.source_revision_id,
            d.title,
            snippet({table_name}, 3, '>>>', '<<<', '...', 48) AS snippet,
            rank
        FROM {table_name}
        JOIN retrieval_chunks AS c ON c.chunk_id = {table_name}.chunk_id
        JOIN retrieval_documents AS d ON d.document_id = c.document_id
        WHERE {table_name} MATCH ?
        {where_sql}
        ORDER BY rank
        LIMIT ?
    """
    with get_connection() as connection:
        try:
            rows = connection.execute(sql, [match_query, *params, limit]).fetchall()
        except sqlite3.Error:
            return []
    return [_search_result_from_row(row, mode=mode) for row in rows]


def _search_like(query: str, *, filters: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    tokens = _query_search_tokens(query) or [query.strip()]
    if not tokens:
        return []
    token_clauses: list[str] = []
    params: list[Any] = []
    for token in tokens:
        token_clauses.append("c.content LIKE ? ESCAPE '\\'")
        params.append(f"%{_escape_like_token(token)}%")
    filter_sql, filter_params = _chunk_filter_sql(filters, table_alias="c", prefix="AND")
    sql = f"""
        SELECT
            c.*,
            d.source_revision_id,
            d.title
        FROM retrieval_chunks AS c
        JOIN retrieval_documents AS d ON d.document_id = c.document_id
        WHERE ({' OR '.join(token_clauses)})
        {filter_sql}
        ORDER BY c.updated_at DESC, c.ordinal ASC
        LIMIT ?
    """
    with get_connection() as connection:
        rows = connection.execute(sql, [*params, *filter_params, limit]).fetchall()
    return [
        _search_result_from_row(row, mode="like", snippet=_make_text_snippet(str(row["content"] or ""), tokens=tokens))
        for row in rows
    ]


def _replace_fts_rows(
    connection: sqlite3.Connection,
    *,
    chunk_id: str,
    document_id: str,
    title: str,
    content: str,
) -> None:
    connection.execute("DELETE FROM retrieval_chunks_fts WHERE chunk_id = ?", (chunk_id,))
    connection.execute("DELETE FROM retrieval_chunks_fts_trigram WHERE chunk_id = ?", (chunk_id,))
    connection.execute(
        "INSERT INTO retrieval_chunks_fts(chunk_id, document_id, title, content) VALUES (?, ?, ?, ?)",
        (chunk_id, document_id, title, content),
    )
    connection.execute(
        "INSERT INTO retrieval_chunks_fts_trigram(chunk_id, document_id, title, content) VALUES (?, ?, ?, ?)",
        (chunk_id, document_id, title, content),
    )


def _chunk_filter_sql(
    filters: dict[str, Any],
    *,
    table_alias: str,
    prefix: str = "WHERE",
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    for key in ("source_kind", "source_id", "document_id"):
        value = str(filters.get(key) or "").strip()
        if not value:
            continue
        column = key if key != "document_id" else "document_id"
        clauses.append(f"{table_alias}.{column} = ?")
        params.append(value)
    if not clauses:
        return "", []
    return f"{prefix} {' AND '.join(clauses)}", params


def _document_from_row(row: Any) -> dict[str, Any]:
    if row is None:
        raise FileNotFoundError("Retrieval document does not exist.")
    payload = dict(row)
    payload["scope"] = _json_loads(payload.get("scope_json"), {})
    payload["metadata"] = _json_loads(payload.get("metadata_json"), {})
    return payload


def _chunk_from_row(row: Any, document: dict[str, Any] | None = None) -> dict[str, Any]:
    if row is None:
        raise FileNotFoundError("Retrieval chunk does not exist.")
    payload = dict(row)
    payload["source_locator"] = _json_loads(payload.get("source_locator_json"), {})
    payload["metadata"] = _json_loads(payload.get("metadata_json"), {})
    source_revision_id = str((document or {}).get("source_revision_id") or "")
    payload["source_ref"] = {
        "source_kind": str(payload.get("source_kind") or ""),
        "source_id": str(payload.get("source_id") or ""),
        "source_revision_id": source_revision_id,
        "source_locator": payload["source_locator"],
    }
    return payload


def _search_result_from_row(row: Any, *, mode: str, snippet: str | None = None) -> dict[str, Any]:
    chunk = _chunk_from_row(
        row,
        {
            "source_revision_id": str(row["source_revision_id"] or "") if _row_has_key(row, "source_revision_id") else "",
        },
    )
    score = float(row["rank"]) if _row_has_key(row, "rank") and row["rank"] is not None else 0.0
    return {
        "chunk_id": chunk["chunk_id"],
        "document_id": chunk["document_id"],
        "title": str(row["title"] or "") if _row_has_key(row, "title") else "",
        "content": chunk["content"],
        "snippet": snippet if snippet is not None else str(row["snippet"] or ""),
        "updated_at": str(row["updated_at"] or "") if _row_has_key(row, "updated_at") else "",
        "score": score,
        "source_ref": chunk["source_ref"],
        "metadata": chunk["metadata"],
        "retrieval": {
            "mode": mode,
            "score": score,
        },
    }


def _hybrid_entry(result: dict[str, Any]) -> dict[str, Any]:
    retrieval = _coerce_dict(result.get("retrieval"))
    return {
        "chunk_id": str(result.get("chunk_id") or ""),
        "document_id": str(result.get("document_id") or ""),
        "title": str(result.get("title") or ""),
        "content": str(result.get("content") or ""),
        "snippet": str(result.get("snippet") or ""),
        "updated_at": str(result.get("updated_at") or ""),
        "source_ref": _coerce_dict(result.get("source_ref")),
        "metadata": _coerce_dict(result.get("metadata")),
        "score": 0.0,
        "retrieval": {
            "mode": "hybrid",
            "lexical_score": float(retrieval.get("lexical_score") or 0.0),
            "vector_score": float(retrieval.get("vector_score") or result.get("score") or 0.0)
            if retrieval.get("mode") == "vector"
            else 0.0,
            "recency_boost": 0.0,
            "score": 0.0,
        },
    }


def _record_retrieval_audit(
    *,
    query: str,
    filters: dict[str, Any],
    embedding_model_ref: str,
    mode: str,
    results: list[dict[str, Any]],
) -> str:
    query_id = f"rquery_{uuid4().hex[:16]}"
    run_id = str(filters.get("run_id") or "")
    session_id = str(filters.get("session_id") or "")
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO retrieval_queries (
                query_id,
                query_text,
                filters_json,
                embedding_model_ref,
                mode,
                run_id,
                session_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (query_id, query, _json_dumps(filters), embedding_model_ref, mode, run_id, session_id),
        )
        for index, result in enumerate(results, start=1):
            retrieval = _coerce_dict(result.get("retrieval"))
            result_id = f"rresult_{uuid4().hex[:16]}"
            connection.execute(
                """
                INSERT INTO retrieval_results (
                    result_id,
                    query_id,
                    rank,
                    chunk_id,
                    document_id,
                    lexical_score,
                    vector_score,
                    final_score,
                    source_ref_json,
                    metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    result_id,
                    query_id,
                    index,
                    str(result.get("chunk_id") or ""),
                    str(result.get("document_id") or ""),
                    float(retrieval.get("lexical_score") or 0.0),
                    float(retrieval.get("vector_score") or 0.0),
                    float(result.get("score") or 0.0),
                    _json_dumps(_coerce_dict(result.get("source_ref"))),
                    _json_dumps(_coerce_dict(result.get("metadata"))),
                ),
            )
    return query_id


def _rank_score(index: int) -> float:
    return 1.0 / (index + 1)


def _metadata_matches(metadata: dict[str, Any], filters: dict[str, Any]) -> bool:
    for key, expected in filters.items():
        if metadata.get(key) != expected:
            return False
    return True


def _normalize_source_kind(source_kind: str) -> str:
    normalized = str(source_kind or "").strip()
    if normalized not in SUPPORTED_RETRIEVAL_SOURCE_KINDS:
        raise ValueError(f"Unsupported retrieval source_kind: {normalized}")
    return normalized


def _document_id(source_kind: str, source_id: str, source_revision_id: str) -> str:
    return f"rdoc_{_short_hash([source_kind, source_id, source_revision_id])}"


def _chunk_id(document_id: str, ordinal: int, content: str) -> str:
    return f"rch_{_short_hash([document_id, str(ordinal), content])}"


def _content_hash(content: str) -> str:
    return f"sha256:{hashlib.sha256(str(content or '').encode('utf-8')).hexdigest()}"


def _short_hash(parts: list[str]) -> str:
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()[:20]


def _estimate_tokens(content: str) -> int:
    return max(1, len(content) // 4) if content else 0


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


def _sanitize_fts5_query(query: str) -> str:
    sanitized = re.sub(r'[+{}()"^]', " ", query)
    sanitized = re.sub(r"\*+", "*", sanitized)
    sanitized = re.sub(r"(^|\s)\*", r"\1", sanitized)
    sanitized = re.sub(r"(?i)^(AND|OR|NOT)\b\s*", "", sanitized.strip())
    sanitized = re.sub(r"(?i)\s+(AND|OR|NOT)\s*$", "", sanitized.strip())
    sanitized = re.sub(r"\b(\w+(?:[._-]\w+)+)\b", r'"\1"', sanitized)
    return sanitized.strip()


def _trigram_query(query: str) -> str:
    return " ".join(f'"{token.replace(chr(34), chr(34) * 2)}"' for token in _query_search_tokens(query))


def _query_search_tokens(query: str, *, cjk_only: bool = False) -> list[str]:
    raw = query.strip().strip('"')
    tokens = [token.strip().strip('"') for token in raw.split() if token.strip().strip('"')]
    if not tokens and raw:
        tokens = [raw]
    if cjk_only:
        return [token for token in tokens if _contains_cjk(token)]
    return tokens


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
    for token in tokens:
        if not token:
            continue
        index = content.find(token)
        if index >= 0:
            start = max(0, index - 40)
            end = min(len(content), index + len(token) + 40)
            prefix = "..." if start > 0 else ""
            suffix = "..." if end < len(content) else ""
            return f"{prefix}{content[start:index]}>>>{content[index:index + len(token)]}<<<{content[index + len(token):end]}{suffix}"
    return content[:120]


def _row_has_key(row: Any, key: str) -> bool:
    return key in row.keys()


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

from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from typing import Any

from app.core.storage.content_blob_store import get_content_blob, put_content_blob
from app.core.storage.database import get_connection


CONTEXT_ASSEMBLY_KIND = "context_assembly_ref"
SUPPORTED_SOURCE_KINDS = {
    "buddy_message",
    "buddy_session_summary",
    "memory_entry",
    "retrieval_chunk",
    "graph_run",
    "graph_output",
}


def create_context_assembly(
    *,
    target_state_key: str,
    renderer_key: str,
    renderer_version: str,
    rendered_text: str,
    sources: list[dict[str, Any]],
    budget: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    assembly_id: str | None = None,
) -> dict[str, Any]:
    normalized_assembly_id = _normalize_assembly_id(assembly_id)
    normalized_sources = _normalize_sources(sources)
    blob = put_content_blob(
        rendered_text,
        "text/plain",
        {
            "kind": "context_assembly_rendered",
            "assembly_id": normalized_assembly_id,
            "renderer_key": renderer_key,
            "renderer_version": renderer_version,
            "target_state_key": target_state_key,
        },
    )
    created_at = _utc_now_sql()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT OR REPLACE INTO context_assemblies (
                assembly_id,
                target_state_key,
                renderer_key,
                renderer_version,
                rendered_content_hash,
                source_count,
                budget_json,
                metadata_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_assembly_id,
                str(target_state_key or ""),
                str(renderer_key or ""),
                str(renderer_version or ""),
                blob["content_hash"],
                len(normalized_sources),
                _json_dumps(budget or {}),
                _json_dumps(metadata or {}),
                created_at,
            ),
        )
        connection.execute("DELETE FROM context_assembly_sources WHERE assembly_id = ?", (normalized_assembly_id,))
        for ordinal, source in enumerate(normalized_sources):
            connection.execute(
                """
                INSERT INTO context_assembly_sources (
                    source_ref_id,
                    assembly_id,
                    ordinal,
                    source_kind,
                    source_id,
                    source_revision_id,
                    source_content_hash,
                    role,
                    label,
                    metadata_json,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    f"{normalized_assembly_id}:src:{ordinal}",
                    normalized_assembly_id,
                    ordinal,
                    source["source_kind"],
                    source["source_id"],
                    source.get("source_revision_id", ""),
                    source.get("source_content_hash", ""),
                    source.get("role", ""),
                    source.get("label", ""),
                    _json_dumps(source.get("metadata", {})),
                    created_at,
                ),
            )

    return _build_ref(
        assembly_id=normalized_assembly_id,
        target_state_key=target_state_key,
        renderer_key=renderer_key,
        renderer_version=renderer_version,
        rendered_content_hash=str(blob["content_hash"]),
        source_count=len(normalized_sources),
    )


def load_context_assembly(assembly_id: str) -> dict[str, Any]:
    normalized_assembly_id = str(assembly_id or "").strip()
    with get_connection() as connection:
        assembly_row = connection.execute(
            "SELECT * FROM context_assemblies WHERE assembly_id = ?",
            (normalized_assembly_id,),
        ).fetchone()
        if assembly_row is None:
            raise FileNotFoundError(f"Context assembly '{normalized_assembly_id}' does not exist.")
        source_rows = connection.execute(
            """
            SELECT *
            FROM context_assembly_sources
            WHERE assembly_id = ?
            ORDER BY ordinal ASC
            """,
            (normalized_assembly_id,),
        ).fetchall()
        warning_rows = connection.execute(
            """
            SELECT *
            FROM context_assembly_warnings
            WHERE assembly_id = ?
            ORDER BY created_at ASC
            """,
            (normalized_assembly_id,),
        ).fetchall()

    assembly = dict(assembly_row)
    assembly["budget"] = _json_loads(assembly.get("budget_json"), {})
    assembly["metadata"] = _json_loads(assembly.get("metadata_json"), {})
    assembly["sources"] = [_source_row_to_dict(row) for row in source_rows]
    assembly["warnings"] = [_warning_row_to_dict(row) for row in warning_rows]
    return assembly


def expand_context_assembly_ref(ref: dict[str, Any]) -> dict[str, Any]:
    if not is_context_assembly_ref(ref):
        raise ValueError("Expected a context_assembly_ref value.")

    assembly = _load_or_materialize_ref(ref)
    warnings = list(assembly.get("warnings") or [])
    rendered_hash = str(assembly.get("rendered_content_hash") or "")
    try:
        blob = get_content_blob(rendered_hash)
        text = _blob_text(blob)
    except FileNotFoundError:
        text = _render_sources(assembly.get("sources") or [])
        rebuilt_hash = _text_hash(text)
        put_content_blob(
            text,
            "text/plain",
            {
                "kind": "context_assembly_rebuilt",
                "assembly_id": assembly["assembly_id"],
                "renderer_key": assembly["renderer_key"],
                "renderer_version": assembly["renderer_version"],
            },
        )
        if rendered_hash and rebuilt_hash != rendered_hash:
            warning = _record_warning(
                assembly["assembly_id"],
                "rendered_hash_mismatch",
                "context assembly rendered hash mismatch after source rebuild",
                {
                    "expected_hash": rendered_hash,
                    "rebuilt_hash": rebuilt_hash,
                },
            )
            warnings.append(warning)
            assembly = load_context_assembly(assembly["assembly_id"])

    return {
        "text": text,
        "assembly": assembly,
        "warnings": warnings,
    }


def is_context_assembly_ref(value: Any) -> bool:
    return isinstance(value, dict) and value.get("kind") == CONTEXT_ASSEMBLY_KIND


def _load_or_materialize_ref(ref: dict[str, Any]) -> dict[str, Any]:
    assembly_id = str(ref.get("assembly_id") or "").strip()
    if assembly_id:
        try:
            return load_context_assembly(assembly_id)
        except FileNotFoundError:
            pass

    sources = _normalize_sources(list(ref.get("source_refs") or ref.get("sources") or []))
    rendered_text = _render_sources(sources)
    created_ref = create_context_assembly(
        assembly_id=assembly_id or None,
        target_state_key=str(ref.get("target_state_key") or ""),
        renderer_key=str(ref.get("renderer_key") or "context_assembly"),
        renderer_version=str(ref.get("renderer_version") or "1"),
        rendered_text=rendered_text,
        sources=sources,
        budget=_coerce_dict(ref.get("budget")),
        metadata=_coerce_dict(ref.get("metadata")),
    )
    return load_context_assembly(created_ref["assembly_id"])


def _render_sources(sources: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for source in sources:
        source_kind = str(source.get("source_kind") or "")
        if source_kind == "buddy_message":
            content, role = _read_buddy_message_source(source)
            if content:
                lines.append(_format_buddy_history_line(role or str(source.get("role") or ""), content))
            continue
        if source_kind == "buddy_session_summary":
            content = _read_buddy_session_summary_source()
            if content:
                lines.append("已有会话摘要:")
                lines.append(content)
            continue
        if source_kind == "graph_run":
            content = _read_graph_run_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "graph_output":
            content = _read_graph_output_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "retrieval_chunk":
            content = _read_retrieval_chunk_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "memory_entry":
            content = _read_memory_entry_source(source)
            if content:
                lines.append(content)
    return "\n".join(lines)


def _read_buddy_message_source(source: dict[str, Any]) -> tuple[str, str]:
    source_id = str(source.get("source_id") or "").strip()
    revision_id = str(source.get("source_revision_id") or "").strip()
    if not source_id:
        return "", str(source.get("role") or "")
    with get_connection() as connection:
        if revision_id:
            row = connection.execute(
                """
                SELECT role, content
                FROM buddy_message_revisions
                WHERE revision_id = ? AND message_id = ?
                """,
                (revision_id, source_id),
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT role, content FROM buddy_messages WHERE message_id = ? AND deleted_at IS NULL",
                (source_id,),
            ).fetchone()
    if row is None:
        return "", str(source.get("role") or "")
    return str(row["content"] or ""), str(row["role"] or source.get("role") or "")


def _read_buddy_session_summary_source() -> str:
    with get_connection() as connection:
        row = connection.execute("SELECT value_json FROM buddy_kv WHERE key = ?", ("session_summary",)).fetchone()
    if row is None:
        return ""
    payload = _json_loads(row["value_json"], {})
    return str(payload.get("content") or "").strip()


def _read_graph_run_source(source: dict[str, Any]) -> str:
    with get_connection() as connection:
        row = connection.execute("SELECT final_result FROM graph_runs WHERE run_id = ?", (str(source.get("source_id") or ""),)).fetchone()
    return str(row["final_result"] or "").strip() if row is not None else ""


def _read_graph_output_source(source: dict[str, Any]) -> str:
    with get_connection() as connection:
        row = connection.execute("SELECT value_json FROM graph_outputs WHERE output_id = ?", (str(source.get("source_id") or ""),)).fetchone()
    if row is None:
        return ""
    value = _json_loads(row["value_json"], None)
    return _stringify_source_content(value)


def _read_retrieval_chunk_source(source: dict[str, Any]) -> str:
    try:
        with get_connection() as connection:
            row = connection.execute("SELECT content FROM retrieval_chunks WHERE chunk_id = ?", (str(source.get("source_id") or ""),)).fetchone()
    except sqlite3.OperationalError:
        return ""
    return str(row["content"] or "").strip() if row is not None else ""


def _read_memory_entry_source(source: dict[str, Any]) -> str:
    try:
        with get_connection() as connection:
            row = connection.execute("SELECT content FROM memory_entries WHERE memory_id = ?", (str(source.get("source_id") or ""),)).fetchone()
    except sqlite3.OperationalError:
        return ""
    return str(row["content"] or "").strip() if row is not None else ""


def _format_buddy_history_line(role: str, content: str) -> str:
    label = "用户" if role == "user" else "伙伴" if role == "assistant" else "消息"
    return f"{label}: {content.strip()}"


def _record_warning(
    assembly_id: str,
    code: str,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    warning_id = f"{assembly_id}:warning:{uuid.uuid4().hex}"
    created_at = _utc_now_sql()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO context_assembly_warnings (
                warning_id,
                assembly_id,
                code,
                message,
                metadata_json,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (warning_id, assembly_id, code, message, _json_dumps(metadata or {}), created_at),
        )
    return {
        "warning_id": warning_id,
        "assembly_id": assembly_id,
        "code": code,
        "message": message,
        "metadata": metadata or {},
        "created_at": created_at,
    }


def _normalize_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for ordinal, source in enumerate(sources):
        if not isinstance(source, dict):
            continue
        source_kind = str(source.get("source_kind") or source.get("kind") or "").strip()
        source_id = str(source.get("source_id") or source.get("id") or "").strip()
        if source_kind not in SUPPORTED_SOURCE_KINDS or not source_id:
            continue
        normalized.append(
            {
                "source_kind": source_kind,
                "source_id": source_id,
                "source_revision_id": str(source.get("source_revision_id") or source.get("revision_id") or "").strip(),
                "source_content_hash": str(source.get("source_content_hash") or source.get("content_hash") or "").strip(),
                "role": str(source.get("role") or "").strip(),
                "label": str(source.get("label") or "").strip(),
                "metadata": _coerce_dict(source.get("metadata")),
                "ordinal": int(source.get("ordinal") if source.get("ordinal") is not None else ordinal),
            }
        )
    return normalized


def _source_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    payload = dict(row)
    payload["metadata"] = _json_loads(payload.get("metadata_json"), {})
    payload.pop("metadata_json", None)
    return payload


def _warning_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    payload = dict(row)
    payload["metadata"] = _json_loads(payload.get("metadata_json"), {})
    payload.pop("metadata_json", None)
    return payload


def _build_ref(
    *,
    assembly_id: str,
    target_state_key: str,
    renderer_key: str,
    renderer_version: str,
    rendered_content_hash: str,
    source_count: int,
) -> dict[str, Any]:
    return {
        "kind": CONTEXT_ASSEMBLY_KIND,
        "assembly_id": assembly_id,
        "target_state_key": str(target_state_key or ""),
        "renderer_key": str(renderer_key or ""),
        "renderer_version": str(renderer_version or ""),
        "rendered_content_hash": rendered_content_hash,
        "source_count": source_count,
    }


def _normalize_assembly_id(assembly_id: str | None = None) -> str:
    normalized = str(assembly_id or "").strip()
    return normalized or f"ctx_{uuid.uuid4().hex}"


def _text_hash(text: str) -> str:
    return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def _blob_text(blob: dict[str, Any]) -> str:
    if blob.get("content_text") is not None:
        return str(blob.get("content_text") or "")
    content_bytes = blob.get("content_bytes")
    if isinstance(content_bytes, bytes):
        return content_bytes.decode("utf-8", errors="replace")
    return ""


def _stringify_source_content(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


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

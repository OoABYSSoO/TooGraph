from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from typing import Any

from app.core.context_security import apply_context_security_policy, redact_context_secrets, scan_context_text
from app.core.storage.content_blob_store import get_content_blob, put_content_blob
from app.core.storage.database import get_connection


CONTEXT_ASSEMBLY_KIND = "context_assembly_ref"
CONTEXT_PACKAGE_KIND = "context_package"
SUPPORTED_SOURCE_KINDS = {
    "buddy_message",
    "buddy_home_file",
    "buddy_session_summary",
    "memory_entry",
    "knowledge_chunk",
    "capability_result_output",
    "runtime_context_item",
    "page_context_item",
    "web_source_document",
    "web_search_result",
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
    context_source_kind = (
        str(metadata.get("scope") or renderer_key or target_state_key)
        if isinstance(metadata, dict)
        else str(renderer_key or target_state_key)
    )
    rendered_text, context_security_warnings = _apply_context_security_to_text(
        rendered_text,
        source_kind=context_source_kind,
        source_refs=normalized_sources,
        policy=_context_security_policy(metadata),
    )
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
        connection.execute("DELETE FROM context_assembly_warnings WHERE assembly_id = ?", (normalized_assembly_id,))
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
    for warning in context_security_warnings:
        _record_warning(
            normalized_assembly_id,
            str(warning.get("code") or "context_security_warning"),
            str(warning.get("message") or "Context security warning."),
            _coerce_dict(warning.get("metadata")),
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
        text, runtime_security_warnings = _apply_context_security_to_text(
            _render_sources(assembly.get("sources") or []),
            source_kind=str(assembly.get("metadata", {}).get("scope") or assembly.get("renderer_key") or ""),
            source_refs=list(assembly.get("sources") or []),
            policy=_context_security_policy(assembly.get("metadata")),
        )
        warnings = _merge_context_warnings(warnings, runtime_security_warnings)
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

    text, runtime_security_warnings = _apply_context_security_to_text(
        text,
        source_kind=str(assembly.get("metadata", {}).get("scope") or assembly.get("renderer_key") or ""),
        source_refs=list(assembly.get("sources") or []),
        policy=_context_security_policy(assembly.get("metadata")),
    )
    warnings = _merge_context_warnings(warnings, runtime_security_warnings)
    return {
        "text": text,
        "assembly": assembly,
        "warnings": warnings,
    }


def expand_context_package(package: dict[str, Any]) -> dict[str, Any]:
    if not is_context_package(package):
        raise ValueError("Expected a context_package value.")

    warnings = _normalize_context_package_warnings(package.get("warnings"))
    context_ref = package.get("context_ref")
    if is_context_assembly_ref(context_ref):
        expanded = expand_context_assembly_ref(context_ref)
        return {
            "text": str(expanded.get("text") or ""),
            "package": package,
            "assembly": expanded.get("assembly") or {},
            "warnings": warnings + list(expanded.get("warnings") or []),
        }

    return {
        "text": _render_context_package_items(list(package.get("items") or [])),
        "package": package,
        "assembly": {},
        "warnings": warnings,
    }


def is_context_assembly_ref(value: Any) -> bool:
    return isinstance(value, dict) and value.get("kind") == CONTEXT_ASSEMBLY_KIND


def is_context_package(value: Any) -> bool:
    return isinstance(value, dict) and value.get("kind") == CONTEXT_PACKAGE_KIND


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


def _render_context_package_items(items: list[Any]) -> str:
    lines: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        content = str(item.get("content") or item.get("summary") or "").strip()
        if not content:
            continue
        title = str(item.get("title") or item.get("id") or "").strip()
        if title:
            lines.append(f"{title}:")
        lines.append(content)
    return "\n".join(lines)


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
            content = _read_buddy_session_summary_source(source)
            if content:
                lines.append("已有会话摘要:")
                lines.append(content)
            continue
        if source_kind == "buddy_home_file":
            content = _read_buddy_home_file_source(source)
            if content:
                authority = str(_coerce_dict(source.get("metadata")).get("authority") or "context_only").strip()
                source_id = str(source.get("source_id") or "").strip()
                lines.append(f"source: {source_id}")
                lines.append(f"authority: {authority}")
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
        if source_kind == "knowledge_chunk":
            content = _read_knowledge_chunk_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "capability_result_output":
            content = _read_capability_result_output_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "runtime_context_item":
            content = _read_runtime_context_item_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "page_context_item":
            content = _read_page_context_item_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "web_source_document":
            content = _read_web_source_document_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "web_search_result":
            content = _read_web_search_result_source(source)
            if content:
                lines.append(content)
            continue
        if source_kind == "memory_entry":
            content = _read_memory_entry_source(source)
            if content:
                lines.append(content)
    return "\n".join(lines)


def _apply_context_security_to_text(
    text: str,
    *,
    source_kind: str,
    source_refs: list[dict[str, Any]],
    policy: dict[str, Any] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    redacted, redaction_warnings = redact_context_secrets(text, source_kind=source_kind, source_refs=source_refs)
    warnings = [
        *redaction_warnings,
        *scan_context_text(redacted, source_kind=source_kind, source_refs=source_refs),
    ]
    secured, blocking_warnings = apply_context_security_policy(
        redacted,
        warnings,
        policy=policy,
        source_kind=source_kind,
        source_refs=source_refs,
    )
    return secured, [*warnings, *blocking_warnings]


def _merge_context_warnings(first: list[Any], second: list[Any]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for warning in [*first, *second]:
        if not isinstance(warning, dict):
            continue
        code = str(warning.get("code") or "").strip()
        metadata = _coerce_dict(warning.get("metadata"))
        pattern_id = str(metadata.get("pattern_id") or "").strip()
        identity = (code, pattern_id)
        if not code or identity in seen:
            continue
        seen.add(identity)
        merged.append(dict(warning))
    return merged


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


def _read_buddy_session_summary_source(source: dict[str, Any] | None = None) -> str:
    source_id = str((source or {}).get("source_id") or "").strip()
    with get_connection() as connection:
        if source_id and source_id != "session_summary":
            row = connection.execute(
                "SELECT content FROM buddy_session_summaries WHERE summary_id = ?",
                (source_id,),
            ).fetchone()
            if row is not None:
                return str(row["content"] or "").strip()
        row = connection.execute("SELECT value_json FROM buddy_kv WHERE key = ?", ("session_summary",)).fetchone()
    if row is None:
        return ""
    payload = _json_loads(row["value_json"], {})
    return str(payload.get("content") or "").strip()


def _read_buddy_home_file_source(source: dict[str, Any]) -> str:
    source_id = str(source.get("source_id") or "").strip().replace("\\", "/")
    if not source_id or source_id.startswith("/") or ".." in source_id.split("/"):
        return ""
    try:
        from app.buddy.home import ensure_buddy_home, get_default_buddy_home_dir

        buddy_home = ensure_buddy_home(get_default_buddy_home_dir())
        path = (buddy_home / source_id).resolve()
        path.relative_to(buddy_home.resolve())
        return path.read_text(encoding="utf-8", errors="replace").strip() if path.is_file() else ""
    except Exception:
        return ""


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


def _read_knowledge_chunk_source(source: dict[str, Any]) -> str:
    try:
        with get_connection() as connection:
            row = connection.execute("SELECT content FROM knowledge_chunks WHERE chunk_id = ?", (str(source.get("source_id") or ""),)).fetchone()
    except sqlite3.OperationalError:
        return ""
    return str(row["content"] or "").strip() if row is not None else ""


def _read_capability_result_output_source(source: dict[str, Any]) -> str:
    metadata = _coerce_dict(source.get("metadata"))
    run_id = str(metadata.get("run_id") or "").strip()
    state_key = str(metadata.get("state_key") or "").strip()
    output_key = str(metadata.get("output_key") or "").strip()
    if run_id and state_key and output_key:
        content = _read_capability_result_output_from_run(run_id, state_key, output_key)
        if content:
            return content
    content_hash = str(source.get("source_content_hash") or "").strip()
    if content_hash:
        try:
            return _blob_text(get_content_blob(content_hash)).strip()
        except FileNotFoundError:
            return ""
    return ""


def _read_capability_result_output_from_run(run_id: str, state_key: str, output_key: str) -> str:
    try:
        with get_connection() as connection:
            row = connection.execute("SELECT detail_json FROM graph_runs WHERE run_id = ?", (run_id,)).fetchone()
    except sqlite3.OperationalError:
        return ""
    if row is None:
        return ""
    detail = _json_loads(row["detail_json"], {})
    state_values = detail.get("state_values") if isinstance(detail, dict) else {}
    package = state_values.get(state_key) if isinstance(state_values, dict) else None
    if not isinstance(package, dict) or package.get("kind") != "result_package":
        return ""
    outputs = package.get("outputs") if isinstance(package.get("outputs"), dict) else {}
    raw_output = outputs.get(output_key)
    output_value = raw_output.get("value") if isinstance(raw_output, dict) else raw_output
    return _stringify_source_content(output_value)


def _read_runtime_context_item_source(source: dict[str, Any]) -> str:
    content_hash = str(source.get("source_content_hash") or "").strip()
    if content_hash:
        try:
            return _blob_text(get_content_blob(content_hash)).strip()
        except FileNotFoundError:
            return ""
    metadata = _coerce_dict(source.get("metadata"))
    key = str(metadata.get("key") or source.get("label") or source.get("source_id") or "").strip()
    value = metadata.get("value")
    if key and value is not None:
        return f"{key}: {_stringify_source_content(value)}"
    return ""


def _read_page_context_item_source(source: dict[str, Any]) -> str:
    content_hash = str(source.get("source_content_hash") or "").strip()
    if content_hash:
        try:
            return _blob_text(get_content_blob(content_hash)).strip()
        except FileNotFoundError:
            return ""
    metadata = _coerce_dict(source.get("metadata"))
    title = str(metadata.get("section") or source.get("label") or source.get("source_id") or "").strip()
    value = metadata.get("value")
    if title and value is not None:
        return f"{title}:\n{_stringify_source_content(value)}"
    return ""


def _read_web_source_document_source(source: dict[str, Any]) -> str:
    metadata = _coerce_dict(source.get("metadata"))
    artifact_path = str(metadata.get("artifact_path") or source.get("source_id") or "").strip()
    if artifact_path:
        try:
            from app.core.storage.capability_artifact_store import read_capability_artifact_text_for_prompt

            artifact = read_capability_artifact_text_for_prompt(artifact_path)
            content = str(artifact.get("content") or "").strip()
            if content:
                return _format_web_source_document(
                    name=str(artifact.get("name") or metadata.get("title") or artifact_path).strip(),
                    query=str(metadata.get("query") or "").strip(),
                    url=str(metadata.get("source_url") or "").strip(),
                    artifact_path=artifact_path,
                    content=content,
                )
        except Exception:
            pass
    content_hash = str(source.get("source_content_hash") or "").strip()
    if content_hash:
        try:
            return _blob_text(get_content_blob(content_hash)).strip()
        except FileNotFoundError:
            return ""
    return ""


def _read_web_search_result_source(source: dict[str, Any]) -> str:
    content_hash = str(source.get("source_content_hash") or "").strip()
    if content_hash:
        try:
            return _blob_text(get_content_blob(content_hash)).strip()
        except FileNotFoundError:
            return ""
    metadata = _coerce_dict(source.get("metadata"))
    title = str(metadata.get("title") or source.get("label") or "Web result").strip()
    url = str(metadata.get("source_url") or source.get("source_id") or "").strip()
    snippet = str(metadata.get("snippet") or "").strip()
    if not (title or url or snippet):
        return ""
    lines = [f"Web result: {title}"]
    if url:
        lines.append(f"url: {url}")
    if snippet:
        lines.append(snippet)
    return "\n".join(lines)


def _format_web_source_document(*, name: str, query: str, url: str, artifact_path: str, content: str) -> str:
    lines = [f"Web source: {name or artifact_path}"]
    if query:
        lines.append(f"query: {query}")
    if url:
        lines.append(f"url: {url}")
    if artifact_path:
        lines.append(f"artifact_path: {artifact_path}")
    lines.append(content)
    return "\n".join(lines)


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


def _context_security_policy(metadata: Any) -> dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    policy = metadata.get("context_security_policy")
    return dict(policy) if isinstance(policy, dict) else {}


def _normalize_context_package_warnings(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    warnings: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, dict):
            warnings.append(dict(item))
        elif item:
            warnings.append({"code": "context_package_warning", "message": str(item)})
    return warnings


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

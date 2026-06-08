from __future__ import annotations

import hashlib
import json
import re
import shutil
from pathlib import Path
from typing import Any, Iterable
from uuid import uuid4

from app.core.storage.database import get_connection
from app.core.storage.embedding_store import reset_embedding_jobs_for_operation
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file
from app.core.storage.local_input_sources import (
    REPO_ROOT as LOCAL_INPUT_REPO_ROOT,
    SKIPPED_DIRECTORY_NAMES,
    is_denied_local_input_path,
    resolve_local_input_root,
)


REPO_ROOT = LOCAL_INPUT_REPO_ROOT
KNOWLEDGE_ROOT = REPO_ROOT / "knowledge"
MANIFEST_FILE_NAME = "knowledge.json"
MANIFEST_SCHEMA_VERSION = "toograph.knowledge-source/v1"
DEFAULT_TEMPLATE_ID = "knowledge_folder_retrieval_ingestion"


def list_knowledge_bases() -> list[dict[str, Any]]:
    bases = [_with_retrieval_counts(manifest) for manifest in _load_manifest_records()]
    return sorted(bases, key=lambda item: str(item.get("updated_at") or ""), reverse=True)


def import_knowledge_folder(
    *,
    name: str,
    source_path: str,
    collection_id: str | None = None,
    template_id: str = DEFAULT_TEMPLATE_ID,
    read_roots: Iterable[str | Path] | None = None,
) -> dict[str, Any]:
    source_root = resolve_local_input_root(source_path, read_roots=read_roots)
    if not source_root.is_dir():
        raise ValueError(f"Knowledge source path is not a folder: {source_path}")

    normalized_name = str(name or source_root.name or "Knowledge base").strip()
    normalized_collection_id = _normalize_collection_id(
        collection_id,
        fallback_parts=[normalized_name, str(source_root)],
    )
    collection_root = _collection_root(normalized_collection_id)
    source_destination = _ensure_inside_knowledge_root(collection_root / "source")
    manifest_path = _ensure_inside_knowledge_root(collection_root / MANIFEST_FILE_NAME)

    collection_root.mkdir(parents=True, exist_ok=True)
    if source_root.resolve() != source_destination.resolve():
        _replace_managed_source_folder(source_root, source_destination)

    now = utc_now_iso()
    existing = read_json_file(manifest_path, default={})
    existing_manifest = existing if isinstance(existing, dict) else {}
    manifest = {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "collection_id": normalized_collection_id,
        "name": normalized_name,
        "source_root": _display_path(source_destination),
        "original_path": _display_path(source_root),
        "template_id": str(template_id or DEFAULT_TEMPLATE_ID).strip() or DEFAULT_TEMPLATE_ID,
        "folder_package": _folder_package(source_destination),
        "last_run_id": str(existing_manifest.get("last_run_id") or ""),
        "imported_at": str(existing_manifest.get("imported_at") or now),
        "updated_at": now,
    }
    write_json_file(manifest_path, manifest)
    operation = create_knowledge_indexing_operation(
        collection_id=normalized_collection_id,
        source_root=_display_path(source_destination),
        template_id=str(template_id or DEFAULT_TEMPLATE_ID).strip() or DEFAULT_TEMPLATE_ID,
        metadata={"original_path": _display_path(source_root)},
    )
    return {
        "knowledge_base": _with_retrieval_counts({**manifest, "current_operation": operation}),
        "folder_package": manifest["folder_package"],
        "operation": operation,
    }


def record_knowledge_base_run(
    collection_id: str,
    *,
    run_id: str,
    template_id: str | None = None,
    operation_id: str | None = None,
) -> dict[str, Any]:
    normalized_collection_id = _normalize_existing_collection_id(collection_id)
    manifest_path = _collection_root(normalized_collection_id) / MANIFEST_FILE_NAME
    manifest = read_json_file(manifest_path, default=None)
    if not isinstance(manifest, dict):
        raise FileNotFoundError(f"Knowledge base '{normalized_collection_id}' does not exist.")
    normalized_run_id = str(run_id or "").strip()
    if not normalized_run_id:
        raise ValueError("run_id is required.")
    normalized_operation_id = str(operation_id or "").strip()
    operation: dict[str, Any] | None = None
    if normalized_operation_id:
        operation = load_knowledge_indexing_operation(normalized_operation_id)
        if operation["collection_id"] != normalized_collection_id:
            raise ValueError("operation_id does not belong to the requested knowledge base.")
    manifest["last_run_id"] = normalized_run_id
    if str(template_id or "").strip():
        manifest["template_id"] = str(template_id or "").strip()
    manifest["updated_at"] = utc_now_iso()
    write_json_file(manifest_path, manifest)
    if (
        normalized_operation_id
        and operation is not None
        and operation["status"] == "ingesting"
        and operation["stage"] in {"source_imported", "ingestion_run_started"}
    ):
        update_knowledge_indexing_operation(
            normalized_operation_id,
            ingestion_run_id=normalized_run_id,
            status="ingesting",
            stage="ingestion_run_started",
        )
    return _with_retrieval_counts(manifest)


def mark_knowledge_ingestion_run_completed(
    collection_id: str,
    *,
    run_id: str,
    operation_id: str,
    template_id: str | None = None,
) -> dict[str, Any]:
    normalized_collection_id = _normalize_existing_collection_id(collection_id)
    normalized_run_id = str(run_id or "").strip()
    normalized_operation_id = str(operation_id or "").strip()
    if not normalized_run_id:
        raise ValueError("run_id is required.")
    if not normalized_operation_id:
        raise ValueError("operation_id is required.")
    manifest, operation = _load_manifest_and_operation(normalized_collection_id, normalized_operation_id)
    manifest["last_run_id"] = normalized_run_id
    if str(template_id or "").strip():
        manifest["template_id"] = str(template_id or "").strip()
    manifest["updated_at"] = utc_now_iso()
    write_json_file(_collection_root(normalized_collection_id) / MANIFEST_FILE_NAME, manifest)
    updated_operation = update_knowledge_indexing_operation(
        operation["operation_id"],
        ingestion_run_id=normalized_run_id,
        status="embedding",
        stage="embedding_queued",
    )
    return _with_retrieval_counts({**manifest, "current_operation": updated_operation})


def retry_knowledge_indexing_operation(collection_id: str, operation_id: str) -> dict[str, Any]:
    manifest, operation = _load_manifest_and_operation(collection_id, operation_id)
    reset_embedding_jobs_for_operation(operation["operation_id"])
    updated_operation = update_knowledge_indexing_operation(
        operation["operation_id"],
        status="embedding",
        stage="retry_requested",
        last_error="",
        last_error_type="",
        next_retry_at="",
    )
    return _with_retrieval_counts({**manifest, "current_operation": updated_operation})


def pause_knowledge_indexing_operation(collection_id: str, operation_id: str) -> dict[str, Any]:
    manifest, operation = _load_manifest_and_operation(collection_id, operation_id)
    updated_operation = update_knowledge_indexing_operation(
        operation["operation_id"],
        status="paused",
        stage="user_paused",
    )
    return _with_retrieval_counts({**manifest, "current_operation": updated_operation})


def resume_knowledge_indexing_operation(collection_id: str, operation_id: str) -> dict[str, Any]:
    manifest, operation = _load_manifest_and_operation(collection_id, operation_id)
    updated_operation = update_knowledge_indexing_operation(
        operation["operation_id"],
        status="embedding",
        stage="user_resumed",
    )
    return _with_retrieval_counts({**manifest, "current_operation": updated_operation})


def create_knowledge_indexing_operation(
    *,
    collection_id: str,
    source_root: str,
    template_id: str,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    operation_id = f"kop_{uuid4().hex[:20]}"
    now = utc_now_iso()
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO knowledge_indexing_operations (
                operation_id, collection_id, source_root, template_id,
                status, stage, created_at, updated_at, metadata_json
            ) VALUES (?, ?, ?, ?, 'ingesting', 'source_imported', ?, ?, ?)
            """,
            (
                operation_id,
                _normalize_existing_collection_id(collection_id),
                str(source_root or ""),
                str(template_id or DEFAULT_TEMPLATE_ID).strip() or DEFAULT_TEMPLATE_ID,
                now,
                now,
                _json_dumps(metadata or {}),
            ),
        )
    return load_knowledge_indexing_operation(operation_id)


def load_knowledge_indexing_operation(operation_id: str) -> dict[str, Any]:
    normalized_operation_id = str(operation_id or "").strip()
    if not normalized_operation_id:
        raise FileNotFoundError("Knowledge indexing operation id is required.")
    with get_connection() as connection:
        row = connection.execute(
            "SELECT * FROM knowledge_indexing_operations WHERE operation_id = ?",
            (normalized_operation_id,),
        ).fetchone()
    return _operation_from_row(row)


def latest_knowledge_indexing_operation(collection_id: str) -> dict[str, Any] | None:
    normalized_collection_id = _normalize_existing_collection_id(collection_id)
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM knowledge_indexing_operations
            WHERE collection_id = ?
            ORDER BY updated_at DESC, created_at DESC, operation_id DESC
            LIMIT 1
            """,
            (normalized_collection_id,),
        ).fetchone()
    return _operation_from_row(row) if row is not None else None


def update_knowledge_indexing_operation(operation_id: str, **changes: Any) -> dict[str, Any]:
    normalized_operation_id = str(operation_id or "").strip()
    if not normalized_operation_id:
        raise FileNotFoundError("Knowledge indexing operation id is required.")
    allowed_columns = {
        "source_root",
        "template_id",
        "ingestion_run_id",
        "status",
        "stage",
        "last_error_type",
        "last_error",
        "next_retry_at",
        "completed_at",
    }
    assignments: list[str] = []
    values: list[Any] = []
    for key, value in changes.items():
        if key == "embedding_run_ids":
            assignments.append("embedding_run_ids_json = ?")
            values.append(_json_dumps(_coerce_list(value)))
        elif key == "metadata":
            assignments.append("metadata_json = ?")
            values.append(_json_dumps(_coerce_dict(value)))
        elif key in allowed_columns:
            assignments.append(f"{key} = ?")
            values.append(str(value or ""))
    now = utc_now_iso()
    assignments.append("updated_at = ?")
    values.append(now)
    with get_connection() as connection:
        connection.execute(
            f"""
            UPDATE knowledge_indexing_operations
            SET {', '.join(assignments)}
            WHERE operation_id = ?
            """,
            [*values, normalized_operation_id],
        )
        row = connection.execute(
            "SELECT * FROM knowledge_indexing_operations WHERE operation_id = ?",
            (normalized_operation_id,),
        ).fetchone()
    return _operation_from_row(row)


def _load_manifest_and_operation(collection_id: str, operation_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    normalized_collection_id = _normalize_existing_collection_id(collection_id)
    manifest_path = _collection_root(normalized_collection_id) / MANIFEST_FILE_NAME
    manifest = read_json_file(manifest_path, default=None)
    if not isinstance(manifest, dict):
        raise FileNotFoundError(f"Knowledge base '{normalized_collection_id}' does not exist.")
    operation = load_knowledge_indexing_operation(operation_id)
    if operation["collection_id"] != normalized_collection_id:
        raise ValueError("operation_id does not belong to the requested knowledge base.")
    return manifest, operation


def _load_manifest_records() -> list[dict[str, Any]]:
    if not KNOWLEDGE_ROOT.exists():
        return []
    records: list[dict[str, Any]] = []
    for manifest_path in sorted(KNOWLEDGE_ROOT.glob(f"*/{MANIFEST_FILE_NAME}")):
        payload = read_json_file(manifest_path, default={})
        if not isinstance(payload, dict):
            continue
        collection_id = str(payload.get("collection_id") or manifest_path.parent.name).strip()
        if not collection_id:
            continue
        records.append(
            {
                "schemaVersion": str(payload.get("schemaVersion") or MANIFEST_SCHEMA_VERSION),
                "collection_id": collection_id,
                "name": str(payload.get("name") or collection_id),
                "source_root": str(payload.get("source_root") or _display_path(manifest_path.parent / "source")),
                "original_path": str(payload.get("original_path") or ""),
                "template_id": str(payload.get("template_id") or DEFAULT_TEMPLATE_ID),
                "folder_package": payload.get("folder_package") if isinstance(payload.get("folder_package"), dict) else {},
                "last_run_id": str(payload.get("last_run_id") or ""),
                "imported_at": str(payload.get("imported_at") or ""),
                "updated_at": str(payload.get("updated_at") or ""),
            }
        )
    return records


def _with_retrieval_counts(manifest: dict[str, Any]) -> dict[str, Any]:
    collection_id = str(manifest.get("collection_id") or "").strip()
    counts = _retrieval_counts_for_collection(collection_id) if collection_id else _empty_counts()
    counted_operation = counts.pop("current_operation", None)
    current_operation = (
        manifest["current_operation"]
        if isinstance(manifest.get("current_operation"), dict)
        else counted_operation
    )
    return {
        "collection_id": collection_id,
        "name": str(manifest.get("name") or collection_id),
        "source_root": str(manifest.get("source_root") or ""),
        "original_path": str(manifest.get("original_path") or ""),
        "template_id": str(manifest.get("template_id") or DEFAULT_TEMPLATE_ID),
        "last_run_id": str(manifest.get("last_run_id") or ""),
        "imported_at": str(manifest.get("imported_at") or ""),
        "updated_at": str(manifest.get("updated_at") or ""),
        **counts,
        "current_operation": current_operation,
    }


def _retrieval_counts_for_collection(collection_id: str) -> dict[str, Any]:
    with get_connection() as connection:
        document_rows = connection.execute(
            """
            SELECT document_id, updated_at, scope_json
            FROM retrieval_documents
            WHERE source_kind = 'knowledge_document'
              AND scope_json LIKE ? ESCAPE '\\'
            """,
            (_collection_scope_like_pattern(collection_id),),
        ).fetchall()
        document_ids = [
            str(row["document_id"])
            for row in document_rows
            if _json_loads(row["scope_json"], {}).get("collection") == collection_id
        ]
        chunk_ids: list[str] = []
        if document_ids:
            placeholders = ", ".join("?" for _ in document_ids)
            chunk_ids = [
                str(row["chunk_id"])
                for row in connection.execute(
                    f"SELECT chunk_id FROM retrieval_chunks WHERE document_id IN ({placeholders})",
                    document_ids,
                ).fetchall()
            ]
        status_counts = _embedding_job_status_counts(connection, chunk_ids)
        job_count = sum(status_counts.values())
        completed_count = int(status_counts.get("completed", 0))
        pending_count = int(status_counts.get("pending", 0))
        running_count = int(status_counts.get("running", 0))
        retry_wait_count = int(status_counts.get("retry_wait", 0))
        failed_count = int(status_counts.get("failed", 0))
        blocked_count = int(status_counts.get("blocked", 0))
        vector_count = _current_embedding_vector_count(connection, chunk_ids)
        latest_error = _latest_embedding_job_error(connection, chunk_ids)
        next_retry_at = _next_embedding_job_retry(connection, chunk_ids)
        latest_operation_row = connection.execute(
            """
            SELECT *
            FROM knowledge_indexing_operations
            WHERE collection_id = ?
            ORDER BY updated_at DESC, created_at DESC, operation_id DESC
            LIMIT 1
            """,
            (collection_id,),
        ).fetchone()
        latest_operation = _operation_from_row(latest_operation_row) if latest_operation_row is not None else None
    indexing_status = _resolve_knowledge_indexing_status(
        total_jobs=job_count,
        vectors=vector_count,
        pending=pending_count,
        running=running_count,
        retry_wait=retry_wait_count,
        blocked=blocked_count,
        failed=failed_count,
    )
    if (
        job_count == 0
        and latest_operation is not None
        and latest_operation["status"] == "ingesting"
        and latest_operation["stage"] == "source_imported"
    ):
        indexing_status = "ingesting"
    return {
        "document_count": len(document_ids),
        "chunk_count": len(chunk_ids),
        "embedding_job_count": job_count,
        "completed_embedding_job_count": completed_count,
        "pending_embedding_job_count": pending_count,
        "running_embedding_job_count": running_count,
        "retry_wait_embedding_job_count": retry_wait_count,
        "failed_embedding_job_count": failed_count,
        "blocked_embedding_job_count": blocked_count,
        "embedding_vector_count": vector_count,
        "indexing_status": indexing_status,
        "last_error_type": str(latest_error.get("last_error_type") or ""),
        "last_error": str(latest_error.get("last_error") or ""),
        "next_retry_at": next_retry_at,
        "current_operation": latest_operation,
    }


def _empty_counts() -> dict[str, Any]:
    return {
        "document_count": 0,
        "chunk_count": 0,
        "embedding_job_count": 0,
        "completed_embedding_job_count": 0,
        "pending_embedding_job_count": 0,
        "running_embedding_job_count": 0,
        "retry_wait_embedding_job_count": 0,
        "failed_embedding_job_count": 0,
        "blocked_embedding_job_count": 0,
        "embedding_vector_count": 0,
        "indexing_status": "empty",
        "last_error_type": "",
        "last_error": "",
        "next_retry_at": "",
    }


def _replace_managed_source_folder(source_root: Path, destination: Path) -> None:
    destination = _ensure_inside_knowledge_root(destination)
    temp_destination = _ensure_inside_knowledge_root(destination.with_name(f"{destination.name}.tmp"))
    if temp_destination.exists():
        shutil.rmtree(temp_destination)
    shutil.copytree(
        source_root,
        temp_destination,
        symlinks=False,
        ignore=lambda current, names: _copy_ignore(source_root, Path(current), names),
    )
    if destination.exists():
        shutil.rmtree(destination)
    temp_destination.replace(destination)


def _copy_ignore(source_root: Path, current: Path, names: list[str]) -> set[str]:
    ignored: set[str] = set()
    for name in names:
        path = current / name
        if name in SKIPPED_DIRECTORY_NAMES or is_denied_local_input_path(path, read_roots=[source_root]):
            ignored.add(name)
    return ignored


def _collection_root(collection_id: str) -> Path:
    return _ensure_inside_knowledge_root(KNOWLEDGE_ROOT / _normalize_existing_collection_id(collection_id))


def _folder_package(source_root: Path) -> dict[str, Any]:
    return {
        "kind": "local_folder",
        "root": _display_path(source_root),
        "selection_mode": "all",
        "selected": [],
    }


def _normalize_collection_id(value: str | None, *, fallback_parts: list[str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        raw = "_".join(part for part in fallback_parts if part)
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "_", raw).strip("_-").lower()
    if normalized:
        return normalized[:80]
    digest = hashlib.sha256("\x1f".join(fallback_parts).encode("utf-8")).hexdigest()[:12]
    return f"knowledge_{digest}"


def _normalize_existing_collection_id(collection_id: str) -> str:
    normalized = str(collection_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", normalized):
        raise ValueError("collection_id must contain only letters, numbers, underscores, or hyphens.")
    return normalized


def _ensure_inside_knowledge_root(path: Path) -> Path:
    resolved_root = KNOWLEDGE_ROOT.resolve()
    resolved = path.resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError("Knowledge path must stay inside the managed knowledge root.") from exc
    return resolved


def _display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def _collection_scope_like_pattern(collection_id: str) -> str:
    return f'%\"collection\"%{_escape_like_value(collection_id)}%'


def _escape_like_value(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _count_rows_by_ids(connection: Any, sql_template: str, ids: list[str]) -> int:
    if not ids:
        return 0
    placeholders = ", ".join("?" for _ in ids)
    row = connection.execute(sql_template.format(placeholders=placeholders), ids).fetchone()
    return int(row[0] or 0) if row else 0


def _current_embedding_vector_count(connection: Any, chunk_ids: list[str]) -> int:
    if not chunk_ids:
        return 0
    placeholders = ", ".join("?" for _ in chunk_ids)
    row = connection.execute(
        f"""
        SELECT COUNT(*)
        FROM embedding_vectors AS ev
        JOIN retrieval_chunks AS c
          ON c.chunk_id = ev.chunk_id
         AND c.content_hash = ev.content_hash
        WHERE ev.chunk_id IN ({placeholders})
        """,
        chunk_ids,
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _embedding_job_status_counts(connection: Any, chunk_ids: list[str]) -> dict[str, int]:
    if not chunk_ids:
        return {}
    placeholders = ", ".join("?" for _ in chunk_ids)
    rows = connection.execute(
        f"""
        SELECT j.status, COUNT(*) AS job_count
        FROM embedding_jobs AS j
        JOIN retrieval_chunks AS c
          ON c.chunk_id = j.chunk_id
         AND c.content_hash = j.content_hash
        WHERE j.chunk_id IN ({placeholders})
        GROUP BY j.status
        """,
        chunk_ids,
    ).fetchall()
    return {str(row["status"] or ""): int(row["job_count"] or 0) for row in rows}


def _latest_embedding_job_error(connection: Any, chunk_ids: list[str]) -> dict[str, str]:
    if not chunk_ids:
        return {}
    placeholders = ", ".join("?" for _ in chunk_ids)
    row = connection.execute(
        f"""
        SELECT j.last_error_type, j.last_error
        FROM embedding_jobs AS j
        JOIN retrieval_chunks AS c
          ON c.chunk_id = j.chunk_id
         AND c.content_hash = j.content_hash
        WHERE j.chunk_id IN ({placeholders})
          AND j.status IN ('retry_wait', 'failed', 'blocked')
          AND (j.last_error_type != '' OR j.last_error != '')
        ORDER BY j.updated_at DESC, j.created_at DESC, j.job_id DESC
        LIMIT 1
        """,
        chunk_ids,
    ).fetchone()
    if row is None:
        return {}
    return {
        "last_error_type": str(row["last_error_type"] or ""),
        "last_error": str(row["last_error"] or ""),
    }


def _next_embedding_job_retry(connection: Any, chunk_ids: list[str]) -> str:
    if not chunk_ids:
        return ""
    placeholders = ", ".join("?" for _ in chunk_ids)
    row = connection.execute(
        f"""
        SELECT j.next_retry_at
        FROM embedding_jobs AS j
        JOIN retrieval_chunks AS c
          ON c.chunk_id = j.chunk_id
         AND c.content_hash = j.content_hash
        WHERE j.chunk_id IN ({placeholders})
          AND j.status = 'retry_wait'
          AND j.next_retry_at != ''
        ORDER BY j.next_retry_at ASC
        LIMIT 1
        """,
        chunk_ids,
    ).fetchone()
    return str(row["next_retry_at"] or "") if row is not None else ""


def _resolve_knowledge_indexing_status(
    *,
    total_jobs: int,
    vectors: int,
    pending: int,
    running: int,
    retry_wait: int,
    blocked: int,
    failed: int,
) -> str:
    if blocked > 0:
        return "needs_attention"
    if retry_wait > 0:
        return "paused_retrying"
    if pending > 0 or running > 0:
        return "indexing"
    if total_jobs > 0 and vectors >= total_jobs:
        return "ready"
    if vectors > 0:
        return "partially_ready"
    if failed > 0:
        return "failed"
    return "empty"


def _operation_from_row(row: Any) -> dict[str, Any]:
    if row is None:
        raise FileNotFoundError("Knowledge indexing operation does not exist.")
    payload = dict(row)
    return {
        "operation_id": str(payload.get("operation_id") or ""),
        "collection_id": str(payload.get("collection_id") or ""),
        "source_root": str(payload.get("source_root") or ""),
        "template_id": str(payload.get("template_id") or ""),
        "ingestion_run_id": str(payload.get("ingestion_run_id") or ""),
        "embedding_run_ids": _json_loads_list(payload.get("embedding_run_ids_json")),
        "status": str(payload.get("status") or ""),
        "stage": str(payload.get("stage") or ""),
        "last_error_type": str(payload.get("last_error_type") or ""),
        "last_error": str(payload.get("last_error") or ""),
        "next_retry_at": str(payload.get("next_retry_at") or ""),
        "created_at": str(payload.get("created_at") or ""),
        "updated_at": str(payload.get("updated_at") or ""),
        "completed_at": str(payload.get("completed_at") or ""),
        "metadata": _json_loads(payload.get("metadata_json"), {}),
    }


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _coerce_list(value: Any) -> list[Any]:
    return list(value) if isinstance(value, list) else []


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _json_loads(value: Any, fallback: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, str):
        return fallback
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return fallback
    return payload if isinstance(payload, dict) else fallback


def _json_loads_list(value: Any) -> list[Any]:
    if not isinstance(value, str):
        return []
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else []

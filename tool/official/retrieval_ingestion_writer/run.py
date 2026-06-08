from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


def retrieval_ingestion_writer(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.core.storage.embedding_store import queue_embedding_job
        from app.core.storage.retrieval_store import (
            prune_retrieval_scope,
            upsert_retrieval_chunks,
            upsert_retrieval_document,
        )

        source_kind = _as_text(inputs.get("source_kind")) or "buddy_message"
        source = _coerce_dict(inputs.get("source"))
        chunks = _extract_chunks(inputs.get("chunks"))
        if not chunks:
            return _failed("missing_chunks", "chunks must contain at least one chunk candidate.")

        source_documents = _source_documents_by_id(source)
        scope = _coerce_dict(inputs.get("scope"))
        base_metadata = _coerce_dict(inputs.get("metadata"))
        operation_id = _as_text(inputs.get("operation_id"))
        explicit_embedding_model_refs = _normalize_model_refs(inputs.get("embedding_model_refs"))
        embedding_model_refs = explicit_embedding_model_refs or _default_embedding_model_refs()
        sync_mode = _normalize_sync_mode(inputs.get("sync_mode"))

        chunks_by_source: dict[str, list[dict[str, Any]]] = {}
        for chunk in chunks:
            source_id = _chunk_source_id(chunk, source)
            chunks_by_source.setdefault(source_id, []).append(chunk)

        documents: list[dict[str, Any]] = []
        indexed_chunks: list[dict[str, Any]] = []
        embedding_jobs: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []

        for source_id, source_chunks in chunks_by_source.items():
            source_doc = source_documents.get(source_id, {})
            document = upsert_retrieval_document(
                source_kind=source_kind,
                source_id=source_id,
                source_revision_id=_as_text(source_doc.get("source_revision_id") or source_doc.get("revision_id")),
                title=_as_text(source_doc.get("title")) or _as_text(source_chunks[0].get("title")) or source_id,
                content=_as_text(source_doc.get("content")),
                scope={**scope, **_coerce_dict(source_doc.get("scope"))},
                metadata={
                    **base_metadata,
                    **_coerce_dict(source_doc.get("metadata")),
                    "ingestion_source_kind": source_kind,
                },
            )
            documents.append(_public_document(document))
            indexed = upsert_retrieval_chunks(
                document["document_id"],
                [
                    {
                        "chunk_id": _as_text(chunk.get("chunk_id")),
                        "content": _as_text(chunk.get("content")),
                        "source_locator": _coerce_dict(chunk.get("source_locator")),
                        "ordinal": chunk.get("ordinal"),
                        "token_estimate": chunk.get("token_estimate"),
                        "metadata": {
                            **base_metadata,
                            **_coerce_dict(chunk.get("metadata")),
                            "original_chunk_source_kind": _as_text(chunk.get("source_kind")),
                        },
                    }
                    for chunk in source_chunks
                    if _as_text(chunk.get("content"))
                ],
            )
            indexed_chunks.extend(_public_chunk(chunk) for chunk in indexed)
            for model_ref in embedding_model_refs:
                try:
                    embedding_jobs.extend(
                        queue_embedding_job(
                            source_kind,
                            source_id,
                            model_ref,
                            operation_id=operation_id,
                        )
                    )
                except Exception as exc:
                    warnings.append(
                        {
                            "code": "embedding_job_queue_failed",
                            "message": str(exc),
                            "source_id": source_id,
                            "embedding_model_ref": model_ref,
                        }
                    )

        prune_report = {
            "pruned_document_count": 0,
            "pruned_chunk_count": 0,
            "pruned_embedding_job_count": 0,
            "pruned_embedding_vector_count": 0,
        }
        if sync_mode == "sync_scope":
            prune_report = prune_retrieval_scope(
                source_kind=source_kind,
                scope=scope,
                keep_source_ids=list(chunks_by_source.keys()),
                keep_chunk_ids=[_as_text(chunk.get("chunk_id")) for chunk in indexed_chunks],
            )

        return {
            "status": "succeeded",
            "ingestion_report": {
                "source_kind": source_kind,
                "sync_mode": sync_mode,
                "document_count": len(documents),
                "chunk_count": len(indexed_chunks),
                "embedding_model_refs": embedding_model_refs,
                "operation_id": operation_id,
                "embedding_job_count": len(embedding_jobs),
                **prune_report,
                "warnings": warnings,
            },
            "documents": documents,
            "indexed_chunks": indexed_chunks,
            "embedding_jobs": [_public_job(job) for job in embedding_jobs],
            "warnings": warnings,
        }
    except Exception as exc:
        return _failed("retrieval_ingestion_failed", str(exc))


def _extract_chunks(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        return _list_dicts(value.get("chunks"))
    return _list_dicts(value)


def _source_documents_by_id(source: dict[str, Any]) -> dict[str, dict[str, Any]]:
    documents: dict[str, dict[str, Any]] = {}
    for document in _list_dicts(source.get("documents")):
        document_id = _as_text(document.get("document_id") or document.get("doc_id") or document.get("source_id"))
        if document_id:
            documents[document_id] = document
    source_id = _as_text(source.get("source_id") or source.get("session_id") or source.get("document_id"))
    if source_id and source_id not in documents:
        documents[source_id] = source
    return documents


def _chunk_source_id(chunk: dict[str, Any], source: dict[str, Any]) -> str:
    source_id = _as_text(chunk.get("source_id"))
    if source_id:
        return source_id
    locator = _coerce_dict(chunk.get("source_locator"))
    for key in ("document_id", "doc_id", "session_id", "source_id"):
        value = _as_text(locator.get(key))
        if value:
            return value
    for key in ("source_id", "session_id", "document_id"):
        value = _as_text(source.get(key))
        if value:
            return value
    chunk_id = _as_text(chunk.get("chunk_id"))
    if chunk_id:
        return chunk_id
    raise ValueError("Each chunk needs source_id or a source package id.")


def _normalize_model_refs(value: Any) -> list[str]:
    if isinstance(value, str):
        raw_items = value.replace("\n", ",").split(",")
    elif isinstance(value, list):
        raw_items = value
    else:
        raw_items = []
    refs: list[str] = []
    for item in raw_items:
        text = _as_text(item)
        if text and text not in refs:
            refs.append(text)
    return refs


def _normalize_sync_mode(value: Any) -> str:
    normalized = _as_text(value) or "upsert"
    if normalized not in {"upsert", "sync_scope"}:
        raise ValueError(f"Unsupported sync_mode: {normalized}")
    return normalized


def _default_embedding_model_refs() -> list[str]:
    try:
        from app.core.storage.embedding_model_sync import get_default_embedding_model_refs_from_settings

        return get_default_embedding_model_refs_from_settings()
    except Exception:
        return []


def _public_document(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "document_id": _as_text(document.get("document_id")),
        "source_kind": _as_text(document.get("source_kind")),
        "source_id": _as_text(document.get("source_id")),
        "source_revision_id": _as_text(document.get("source_revision_id")),
        "title": _as_text(document.get("title")),
        "content_hash": _as_text(document.get("content_hash")),
    }


def _public_chunk(chunk: dict[str, Any]) -> dict[str, Any]:
    return {
        "chunk_id": _as_text(chunk.get("chunk_id")),
        "document_id": _as_text(chunk.get("document_id")),
        "source_kind": _as_text(chunk.get("source_kind")),
        "source_id": _as_text(chunk.get("source_id")),
        "content_hash": _as_text(chunk.get("content_hash")),
        "token_estimate": int(chunk.get("token_estimate") or 0),
        "source_ref": _coerce_dict(chunk.get("source_ref")),
        "metadata": _coerce_dict(chunk.get("metadata")),
    }


def _public_job(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "job_id": _as_text(job.get("job_id")),
        "status": _as_text(job.get("status")),
        "operation_id": _as_text(job.get("operation_id")),
        "source_kind": _as_text(job.get("source_kind")),
        "source_id": _as_text(job.get("source_id")),
        "chunk_id": _as_text(job.get("chunk_id")),
        "embedding_model_id": _as_text(job.get("embedding_model_id")),
        "content_hash": _as_text(job.get("content_hash")),
    }


def _failed(error_type: str, message: str) -> dict[str, Any]:
    warning = {"code": error_type, "message": message}
    return {
        "status": "failed",
        "error_type": error_type,
        "error": message,
        "ingestion_report": {
            "document_count": 0,
            "chunk_count": 0,
            "embedding_job_count": 0,
            "warnings": [warning],
        },
        "documents": [],
        "indexed_chunks": [],
        "embedding_jobs": [],
        "warnings": [warning],
    }


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _list_dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps(_failed("invalid_json", str(exc)), ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(json.dumps(_failed("invalid_input", "stdin must be a JSON object."), ensure_ascii=False))
        return
    print(json.dumps(retrieval_ingestion_writer(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

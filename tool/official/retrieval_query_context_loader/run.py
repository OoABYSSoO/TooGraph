from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_LIMIT = 8
DEFAULT_MAX_CHARS = 8000


def retrieval_query_context_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.core.storage.retrieval_store import hybrid_search, load_retrieval_ranking_report

        query = _as_text(inputs.get("query"))
        if not query:
            return _succeeded_empty("missing_query", "query is required.")

        filters = _coerce_dict(inputs.get("filters"))
        limits = _coerce_dict(inputs.get("limits"))
        limit = _bounded_int(limits.get("limit") if "limit" in limits else inputs.get("limit"), default=DEFAULT_LIMIT, minimum=1, maximum=50)
        max_chars = _bounded_int(
            limits.get("max_chars") if "max_chars" in limits else inputs.get("max_chars"),
            default=DEFAULT_MAX_CHARS,
            minimum=512,
            maximum=50000,
        )
        embedding_model_ref = _resolve_embedding_model_ref(inputs)
        reranker_model_ref = _as_text(inputs.get("reranker_model_ref"))
        audit_context = _resolve_audit_context(inputs)

        ranked = hybrid_search(
            query,
            filters=filters,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
            limit=limit,
            run_id=audit_context["run_id"],
            session_id=audit_context["session_id"],
        )
        rendered_text, source_refs, ranked_chunks, budget = _render_ranked_chunks(
            query=query,
            ranked=ranked,
            max_chars=max_chars,
        )
        query_ids = _dedupe(
            [
                _as_text(_coerce_dict(result.get("retrieval")).get("query_id"))
                for result in ranked
                if isinstance(result, dict)
            ]
        )
        ranking_report = load_retrieval_ranking_report(query_ids[0]) if query_ids else _empty_ranking_report(query, filters)
        context_ref = _build_context_ref(
            query=query,
            filters=filters,
            source_refs=source_refs,
            max_chars=max_chars,
            rendered_text=rendered_text,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
        )
        package = _build_context_package(
            query=query,
            filters=filters,
            source_refs=source_refs,
            context_ref=context_ref,
            ranked_chunks=ranked_chunks,
            max_chars=max_chars,
            budget=budget,
            warnings=[],
        )
        return {
            "status": "succeeded",
            "context_package": package,
            "ranked_chunks": ranked_chunks,
            "ranking_report": ranking_report,
        }
    except Exception as exc:
        warning = {"code": "retrieval_query_context_load_failed", "message": str(exc)}
        return {
            "status": "failed",
            "error_type": "retrieval_query_context_load_failed",
            "error": str(exc),
            "context_package": _empty_package([warning]),
            "ranked_chunks": [],
            "ranking_report": {"warnings": [warning]},
        }


def _render_ranked_chunks(
    *,
    query: str,
    ranked: list[dict[str, Any]],
    max_chars: int,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    sections: list[str] = []
    source_refs: list[dict[str, Any]] = []
    ranked_chunks: list[dict[str, Any]] = []
    source_chars = 0
    used_chars = 0
    omitted_count = 0
    for rank, result in enumerate(ranked, start=1):
        chunk_id = _as_text(result.get("chunk_id"))
        if not chunk_id:
            continue
        source_ref = _source_ref_for_result(result, rank=rank, query=query)
        source_refs.append(source_ref)
        content = _as_text(result.get("content"))
        title = _as_text(result.get("title")) or chunk_id
        snippet = _as_text(result.get("snippet"))
        section = "\n".join(
            item
            for item in [
                f"[{rank}] {title}",
                f"chunk_id: {chunk_id}",
                f"source: {_as_text(source_ref['metadata'].get('original_source_kind'))}/{_as_text(source_ref['metadata'].get('original_source_id'))}",
                f"score: {float(result.get('score') or 0.0):.6f}",
                f"snippet: {snippet}" if snippet else "",
                content,
            ]
            if item
        ).strip()
        source_chars += len(section)
        separator = "\n\n" if sections else ""
        remaining = max_chars - used_chars
        if remaining <= 0:
            omitted_count += 1
            continue
        section_with_separator = f"{separator}{section}"
        if len(section_with_separator) > remaining:
            section_with_separator = section_with_separator[: max(0, remaining)] + "\n[Retrieval context omitted by max_chars budget.]"
            omitted_count += 1
        used_chars += len(section_with_separator)
        sections.append(section_with_separator if not separator else section_with_separator[len(separator):])
        ranked_chunks.append(
            {
                "rank": rank,
                "chunk_id": chunk_id,
                "document_id": _as_text(result.get("document_id")),
                "title": title,
                "snippet": snippet,
                "score": float(result.get("score") or 0.0),
                "source_ref": source_ref,
                "metadata": _coerce_dict(result.get("metadata")),
                "retrieval": _coerce_dict(result.get("retrieval")),
            }
        )
    return (
        "\n\n".join(sections),
        source_refs,
        ranked_chunks,
        {
            "source_chars": source_chars,
            "used_chars": used_chars,
            "context_chars": used_chars,
            "omitted_count": omitted_count,
        },
    )


def _source_ref_for_result(result: dict[str, Any], *, rank: int, query: str) -> dict[str, Any]:
    original_ref = _coerce_dict(result.get("source_ref"))
    original_locator = _coerce_dict(original_ref.get("source_locator"))
    return {
        "source_kind": "retrieval_chunk",
        "source_id": _as_text(result.get("chunk_id")),
        "source_revision_id": _as_text(original_ref.get("source_revision_id")),
        "label": _as_text(result.get("title")) or _as_text(result.get("chunk_id")),
        "ordinal": rank - 1,
        "metadata": {
            "query": query,
            "rank": rank,
            "document_id": _as_text(result.get("document_id")),
            "original_source_kind": _as_text(original_ref.get("source_kind")),
            "original_source_id": _as_text(original_ref.get("source_id")),
            "original_source_locator": original_locator,
            "retrieval": _coerce_dict(result.get("retrieval")),
        },
    }


def _build_context_ref(
    *,
    query: str,
    filters: dict[str, Any],
    source_refs: list[dict[str, Any]],
    max_chars: int,
    rendered_text: str,
    embedding_model_ref: str,
    reranker_model_ref: str,
) -> dict[str, Any]:
    if not source_refs:
        return _empty_context_ref()
    try:
        from app.core.storage.context_assembly_store import create_context_assembly

        return create_context_assembly(
            target_state_key="retrieval_context",
            renderer_key="retrieval_query",
            renderer_version="1",
            rendered_text=rendered_text,
            sources=source_refs,
            budget={"max_chars": max_chars},
            metadata={
                "scope": "retrieval",
                "query": query,
                "filters": filters,
                "embedding_model_ref": embedding_model_ref,
                "reranker_model_ref": reranker_model_ref,
            },
        )
    except Exception:
        source_key = [[ref.get("source_kind"), ref.get("source_id")] for ref in source_refs]
        key = json.dumps({"source_refs": source_key, "query": query, "max_chars": max_chars}, ensure_ascii=False, sort_keys=True)
        return {
            "kind": "context_assembly_ref",
            "assembly_id": f"ctx_retrieval_{hashlib.sha256(key.encode('utf-8')).hexdigest()[:16]}",
            "target_state_key": "retrieval_context",
            "renderer_key": "retrieval_query",
            "renderer_version": "1",
            "rendered_content_hash": _content_hash(rendered_text) if rendered_text else "",
            "source_count": len(source_refs),
            "source_refs": source_refs,
            "budget": {"max_chars": max_chars},
            "metadata": {"scope": "retrieval", "query": query, "filters": filters},
        }


def _build_context_package(
    *,
    query: str,
    filters: dict[str, Any],
    source_refs: list[dict[str, Any]],
    context_ref: dict[str, Any],
    ranked_chunks: list[dict[str, Any]],
    max_chars: int,
    budget: dict[str, int],
    warnings: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": _context_package_id(context_ref, source_refs),
        "source_kind": "retrieval",
        "authority": "evidence",
        "title": "Retrieval query context",
        "items": [
            {
                "id": _as_text(source.get("source_id")),
                "title": _as_text(source.get("label")) or "Retrieval chunk",
                "source_ref": source,
                "metadata": _coerce_dict(source.get("metadata")),
            }
            for source in source_refs
        ],
        "source_refs": source_refs,
        "source_count": len(source_refs),
        "context_ref": context_ref,
        "budget": {"max_chars": max_chars, **budget},
        "warnings": warnings,
        "metadata": {
            "renderer_key": "retrieval_query",
            "renderer_version": "1",
            "query": query,
            "filters": filters,
            "ranked_chunk_count": len(ranked_chunks),
        },
    }


def _empty_package(warnings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": "pkg_retrieval_empty",
        "source_kind": "retrieval",
        "authority": "evidence",
        "title": "Retrieval query context",
        "items": [],
        "source_refs": [],
        "source_count": 0,
        "context_ref": _empty_context_ref(),
        "budget": {"source_chars": 0, "used_chars": 0, "context_chars": 0, "omitted_count": 0},
        "warnings": warnings,
        "metadata": {"renderer_key": "retrieval_query", "renderer_version": "1"},
    }


def _empty_context_ref() -> dict[str, Any]:
    return {
        "kind": "context_assembly_ref",
        "assembly_id": "ctx_retrieval_empty",
        "target_state_key": "retrieval_context",
        "renderer_key": "retrieval_query",
        "renderer_version": "1",
        "rendered_content_hash": "",
        "source_count": 0,
        "source_refs": [],
    }


def _succeeded_empty(code: str, message: str) -> dict[str, Any]:
    warning = {"code": code, "message": message}
    return {
        "status": "succeeded",
        "context_package": _empty_package([warning]),
        "ranked_chunks": [],
        "ranking_report": {"warnings": [warning]},
    }


def _empty_ranking_report(query: str, filters: dict[str, Any]) -> dict[str, Any]:
    return {
        "kind": "retrieval_ranking_report",
        "query_id": "",
        "query_text": query,
        "mode": "hybrid",
        "filters": filters,
        "result_count": 0,
        "ranked_results": [],
    }


def _context_package_id(context_ref: dict[str, Any], source_refs: list[dict[str, Any]]) -> str:
    assembly_id = _as_text(context_ref.get("assembly_id"))
    if assembly_id.startswith("ctx_"):
        return f"pkg_{assembly_id[4:]}"
    seed = json.dumps({"assembly_id": assembly_id, "source_refs": source_refs}, ensure_ascii=False, sort_keys=True)
    return f"pkg_retrieval_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:12]}"


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _resolve_embedding_model_ref(inputs: dict[str, Any]) -> str:
    explicit_ref = _as_text(inputs.get("embedding_model_ref"))
    if explicit_ref:
        return explicit_ref
    try:
        from app.core.storage.embedding_model_sync import get_default_embedding_model_ref_from_settings

        return _as_text(get_default_embedding_model_ref_from_settings())
    except Exception:
        return ""


def _resolve_audit_context(inputs: dict[str, Any]) -> dict[str, str]:
    runtime_context = _coerce_dict(inputs.get("runtime_context"))
    env_context = _read_runtime_context_from_environment()
    return {
        "run_id": _as_text(
            inputs.get("run_id")
            or runtime_context.get("run_id")
            or env_context.get("run_id")
            or os.environ.get("TOOGRAPH_ACTION_RUN_ID")
        ),
        "session_id": _as_text(
            inputs.get("session_id")
            or runtime_context.get("session_id")
            or runtime_context.get("buddy_session_id")
            or env_context.get("session_id")
            or env_context.get("buddy_session_id")
        ),
    }


def _read_runtime_context_from_environment() -> dict[str, Any]:
    inline_context = _decode_json_object(_as_text(os.environ.get("TOOGRAPH_ACTION_RUNTIME_CONTEXT")))
    if inline_context:
        return inline_context
    file_path = _as_text(os.environ.get("TOOGRAPH_ACTION_RUNTIME_CONTEXT_FILE"))
    if not file_path:
        return {}
    try:
        return _decode_json_object(Path(file_path).read_text(encoding="utf-8"))
    except Exception:
        return {}


def _decode_json_object(raw: str) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            result.append(value)
            seen.add(value)
    return result


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _content_hash(text: str) -> str:
    return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error_type": "invalid_json",
                    "error": str(exc),
                    "context_package": _empty_package([{"code": "invalid_json", "message": str(exc)}]),
                    "ranked_chunks": [],
                    "ranking_report": {},
                },
                ensure_ascii=False,
            )
        )
        return
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(retrieval_query_context_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

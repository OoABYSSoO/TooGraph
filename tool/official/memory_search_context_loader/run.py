from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_LIMIT = 5
DEFAULT_MAX_CHARS = 8000


def memory_search_context_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.buddy.store import search_memories

        query = _as_text(inputs.get("query"))
        embedding_model_ref = _as_text(inputs.get("embedding_model_ref"))
        reranker_model_ref = _as_text(inputs.get("reranker_model_ref"))
        limit = _bounded_int(inputs.get("limit"), default=DEFAULT_LIMIT, minimum=1, maximum=20)
        max_chars = _bounded_int(inputs.get("max_chars"), default=DEFAULT_MAX_CHARS, minimum=512, maximum=50000)
        result = search_memories(
            query=query,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
            scope_kind=_as_text(inputs.get("scope_kind")),
            scope_id=_as_text(inputs.get("scope_id")),
            layer=_as_text(inputs.get("layer")),
            memory_type=_as_text(inputs.get("memory_type")),
            status=_as_text(inputs.get("status")) or "active",
            limit=limit,
        )
        memories = _list_records(result.get("memories"))
        rendered_text, context_refs, report_refs, source_chars, used_chars, omitted_count = _render_memory_context(
            query=query,
            memories=memories,
            max_chars=max_chars,
        )
        context_ref = _build_context_ref(
            query=query,
            source_refs=context_refs,
            max_chars=max_chars,
            rendered_text=rendered_text,
        )
        package = _build_context_package(
            query=query,
            source_refs=context_refs,
            context_ref=context_ref,
            memories=memories,
            max_chars=max_chars,
            source_chars=source_chars,
            used_chars=used_chars,
            omitted_count=omitted_count,
            warnings=[],
        )
        return {
            "status": "succeeded",
            "memory_search_context": package,
            "memory_search_report": _build_report(
                query=query,
                result=result,
                memories=memories,
                source_refs=report_refs,
                max_chars=max_chars,
                source_chars=source_chars,
                used_chars=used_chars,
                omitted_count=omitted_count,
                warnings=[],
            ),
        }
    except Exception as exc:
        warning = _warning("memory_search_context_load_failed", str(exc))
        return {
            "status": "failed",
            "error_type": "memory_search_context_load_failed",
            "error": str(exc),
            "memory_search_context": _empty_package([warning]),
            "memory_search_report": {
                "scope": "memory_search",
                "source_refs": [],
                "source_count": 0,
                "warnings": [warning],
            },
        }


def _render_memory_context(
    *,
    query: str,
    memories: list[dict[str, Any]],
    max_chars: int,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], int, int, int]:
    sections: list[str] = []
    context_refs: list[dict[str, Any]] = []
    report_refs: list[dict[str, Any]] = []
    source_chars = 0
    used_chars = 0
    omitted_count = 0
    for memory in memories:
        memory_id = _as_text(memory.get("memory_id"))
        if not memory_id:
            continue
        title = _as_text(memory.get("title")) or memory_id
        content = _as_text(memory.get("content"))
        source_ref = {
            "source_kind": "memory_entry",
            "source_id": memory_id,
            "source_revision_id": _as_text(memory.get("latest_revision_id")),
            "label": title,
            "metadata": {
                "query": query,
                "scope_kind": _as_text(memory.get("scope_kind")),
                "scope_id": _as_text(memory.get("scope_id")),
                "layer": _as_text(memory.get("layer")),
                "memory_type": _as_text(memory.get("memory_type")),
                "confidence": memory.get("confidence"),
                "salience": memory.get("salience"),
            },
        }
        context_refs.append(source_ref)
        report_refs.append({"source_kind": "memory_entry", "source_id": memory_id})
        for source in _list_records(memory.get("sources")):
            source_kind = _as_text(source.get("source_kind"))
            source_id = _as_text(source.get("source_id"))
            if source_kind and source_id:
                report_refs.append({"source_kind": source_kind, "source_id": source_id})
        lines = [
            f"Memory: {title}",
            f"memory_id: {memory_id}",
            f"scope: {_as_text(memory.get('scope_kind'))}/{_as_text(memory.get('scope_id'))}",
            f"layer: {_as_text(memory.get('layer'))}",
            f"type: {_as_text(memory.get('memory_type'))}",
        ]
        snippet = _as_text(memory.get("snippet"))
        if snippet:
            lines.append(f"snippet: {snippet}")
        if content:
            lines.append(content)
        section = "\n".join(lines).strip()
        source_chars += len(section)
        separator = "\n\n" if sections else ""
        remaining = max_chars - used_chars
        if remaining <= 0:
            omitted_count += 1
            continue
        section_with_separator = f"{separator}{section}"
        if len(section_with_separator) > remaining:
            section_with_separator = section_with_separator[: max(0, remaining)] + "\n[Memory search context omitted by max_chars budget.]"
            omitted_count += 1
        used_chars += len(section_with_separator)
        sections.append(section_with_separator if not separator else section_with_separator[len(separator):])
    return "\n\n".join(sections), _dedupe_sources(context_refs), _dedupe_sources(report_refs), source_chars, used_chars, omitted_count


def _build_context_ref(
    *,
    query: str,
    source_refs: list[dict[str, Any]],
    max_chars: int,
    rendered_text: str,
) -> dict[str, Any]:
    if not source_refs:
        return _empty_context_ref()
    try:
        from app.core.storage.context_assembly_store import create_context_assembly

        return create_context_assembly(
            target_state_key="memory_search_context",
            renderer_key="memory_search",
            renderer_version="1",
            rendered_text=rendered_text,
            sources=source_refs,
            budget={"max_chars": max_chars},
            metadata={
                "scope": "memory_search",
                "query": query,
            },
        )
    except Exception:
        return {
            "kind": "context_assembly_ref",
            "target_state_key": "memory_search_context",
            "source_refs": source_refs,
            "metadata": {"scope": "memory_search", "query": query},
        }


def _build_context_package(
    *,
    query: str,
    source_refs: list[dict[str, Any]],
    context_ref: dict[str, Any],
    memories: list[dict[str, Any]],
    max_chars: int,
    source_chars: int,
    used_chars: int,
    omitted_count: int,
    warnings: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": _context_package_id(context_ref, source_refs),
        "source_kind": "memory",
        "authority": "memory",
        "title": "Memory search context",
        "items": [
            {
                "id": _as_text(source.get("source_id")),
                "title": _as_text(source.get("label")) or "Memory",
                "source_ref": source,
                "metadata": dict(source.get("metadata") if isinstance(source.get("metadata"), dict) else {}),
            }
            for source in source_refs
        ],
        "source_refs": source_refs,
        "source_count": len(source_refs),
        "context_ref": context_ref,
        "budget": {
            "max_chars": max_chars,
            "source_chars": source_chars,
            "used_chars": used_chars,
            "omitted_count": omitted_count,
        },
        "warnings": warnings,
        "metadata": {
            "renderer_key": "memory_search",
            "renderer_version": "1",
            "query": query,
            "memory_count": len(memories),
        },
    }


def _build_report(
    *,
    query: str,
    result: dict[str, Any],
    memories: list[dict[str, Any]],
    source_refs: list[dict[str, Any]],
    max_chars: int,
    source_chars: int,
    used_chars: int,
    omitted_count: int,
    warnings: list[dict[str, Any]],
) -> dict[str, Any]:
    search_report = result.get("report") if isinstance(result.get("report"), dict) else {}
    return {
        "scope": "memory_search",
        "query": query,
        "mode": search_report.get("mode") or ("keyword" if query else "browse"),
        "embedding_model_ref": _as_text(result.get("embedding_model_ref")),
        "reranker_model_ref": _as_text(result.get("reranker_model_ref")),
        "filters": dict(search_report.get("filters") if isinstance(search_report.get("filters"), dict) else {}),
        "memory_count": len(memories),
        "memory_ids": [_as_text(memory.get("memory_id")) for memory in memories if _as_text(memory.get("memory_id"))],
        "source_refs": source_refs,
        "source_count": len(source_refs),
        "results": [_memory_result(memory) for memory in memories],
        "retrieval_modes": dict(search_report.get("retrieval_modes") if isinstance(search_report.get("retrieval_modes"), dict) else {}),
        "query_ids": list(search_report.get("query_ids") if isinstance(search_report.get("query_ids"), list) else []),
        "ranking_reports": list(search_report.get("ranking_reports") if isinstance(search_report.get("ranking_reports"), list) else []),
        "max_chars": max_chars,
        "source_chars": source_chars,
        "used_chars": used_chars,
        "context_chars": used_chars,
        "omitted_count": omitted_count,
        "warnings": warnings,
    }


def _memory_result(memory: dict[str, Any]) -> dict[str, Any]:
    memory_id = _as_text(memory.get("memory_id"))
    source_refs = [{"source_kind": "memory_entry", "source_id": memory_id}] if memory_id else []
    for source in _list_records(memory.get("sources")):
        source_kind = _as_text(source.get("source_kind"))
        source_id = _as_text(source.get("source_id"))
        if source_kind and source_id:
            source_refs.append({"source_kind": source_kind, "source_id": source_id})
    return {
        "memory_id": memory_id,
        "title": _as_text(memory.get("title")),
        "content": _as_text(memory.get("content")),
        "scope_kind": _as_text(memory.get("scope_kind")),
        "scope_id": _as_text(memory.get("scope_id")),
        "layer": _as_text(memory.get("layer")),
        "memory_type": _as_text(memory.get("memory_type")),
        "confidence": memory.get("confidence"),
        "salience": memory.get("salience"),
        "snippet": _as_text(memory.get("snippet")),
        "retrieval": dict(memory.get("retrieval") if isinstance(memory.get("retrieval"), dict) else {}),
        "source_refs": _dedupe_sources(source_refs),
    }


def _empty_package(warnings: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": "memory_search_empty",
        "source_kind": "memory",
        "authority": "memory",
        "title": "Memory search context",
        "items": [],
        "source_refs": [],
        "source_count": 0,
        "context_ref": _empty_context_ref(),
        "budget": {"max_chars": 0, "source_chars": 0, "used_chars": 0, "omitted_count": 0},
        "warnings": warnings or [],
        "metadata": {"renderer_key": "memory_search", "renderer_version": "1"},
    }


def _empty_context_ref() -> dict[str, Any]:
    return {"kind": "context_assembly_ref", "source_refs": [], "metadata": {"scope": "memory_search"}}


def _context_package_id(context_ref: dict[str, Any], source_refs: list[dict[str, Any]]) -> str:
    seed = json.dumps(
        {
            "assembly_id": context_ref.get("assembly_id") if isinstance(context_ref, dict) else "",
            "source_refs": source_refs,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return f"memory_search_{hashlib.sha256(seed.encode('utf-8')).hexdigest()[:12]}"


def _warning(code: str, message: str) -> dict[str, Any]:
    return {"code": code, "message": message}


def _dedupe_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    result: list[dict[str, Any]] = []
    for source in sources:
        source_kind = _as_text(source.get("source_kind"))
        source_id = _as_text(source.get("source_id"))
        if not source_kind or not source_id:
            continue
        key = (source_kind, source_id)
        if key in seen:
            continue
        seen.add(key)
        result.append(source)
    return result


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _list_records(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as exc:
        print(json.dumps({"status": "failed", "error_type": "invalid_json", "error": str(exc)}, ensure_ascii=False))
        return
    if not isinstance(payload, dict):
        print(
            json.dumps(
                {"status": "failed", "error_type": "invalid_input", "error": "stdin must be a JSON object."},
                ensure_ascii=False,
            )
        )
        return
    print(json.dumps(memory_search_context_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

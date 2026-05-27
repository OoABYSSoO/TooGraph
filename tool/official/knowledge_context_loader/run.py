from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_LIMIT = 5
DEFAULT_MAX_CHARS = 24000


def knowledge_context_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.knowledge.loader import search_knowledge

        query = _as_text(inputs.get("query"))
        knowledge_base = _as_text(inputs.get("knowledge_base"))
        limit = _bounded_int(inputs.get("limit"), default=DEFAULT_LIMIT, minimum=1, maximum=20)
        max_chars = _bounded_int(inputs.get("max_chars"), default=DEFAULT_MAX_CHARS, minimum=512, maximum=200000)
        metadata_filter = _coerce_dict(inputs.get("metadata_filter"))

        results = search_knowledge(
            query,
            knowledge_base=knowledge_base or None,
            limit=limit,
            metadata_filter=metadata_filter,
        )
        rendered_text, source_refs, used_chars, omitted_count, warnings = _render_knowledge_results(
            results,
            max_chars=max_chars,
        )
        context_ref = _build_context_ref(
            source_refs=source_refs,
            query=query,
            knowledge_base=knowledge_base,
            max_chars=max_chars,
            rendered_text=rendered_text,
        )
        used_chars = _context_ref_rendered_chars(context_ref, fallback=used_chars)
        package = _build_context_package(
            context_ref=context_ref,
            results=results,
            source_refs=source_refs,
            query=query,
            knowledge_base=knowledge_base,
            max_chars=max_chars,
            used_chars=used_chars,
            source_chars=sum(len(str(result.get("content") or "")) for result in results),
            omitted_count=omitted_count,
            warnings=warnings,
        )
        return {
            "status": "succeeded",
            "knowledge_context": package,
            "knowledge_context_report": {
                "scope": "knowledge",
                "query": query,
                "knowledge_base": _report_knowledge_base(knowledge_base, results),
                "result_count": len(source_refs),
                "source_refs": source_refs,
                "max_chars": max_chars,
                "used_chars": used_chars,
                "omitted_count": omitted_count,
                "warnings": warnings,
            },
        }
    except Exception as exc:
        warning = _warning("knowledge_context_load_failed", str(exc))
        return {
            "status": "failed",
            "error_type": "knowledge_context_load_failed",
            "error": str(exc),
            "knowledge_context": _empty_package([warning]),
            "knowledge_context_report": {
                "scope": "knowledge",
                "query": _as_text(inputs.get("query")),
                "knowledge_base": _as_text(inputs.get("knowledge_base")),
                "result_count": 0,
                "source_refs": [],
                "warnings": [warning],
            },
        }


def _render_knowledge_results(
    results: list[dict[str, Any]],
    *,
    max_chars: int,
) -> tuple[str, list[dict[str, Any]], int, int, list[dict[str, Any]]]:
    sections: list[str] = []
    source_refs: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    used_chars = 0
    omitted_count = 0
    for result in results:
        chunk_id = _as_text(result.get("chunk_id"))
        if not chunk_id:
            warnings.append(_warning("knowledge_chunk_missing_id", "Knowledge result is missing chunk_id."))
            continue
        section = _render_result_section(result)
        separator = "\n\n" if sections else ""
        remaining = max_chars - used_chars
        if remaining <= 0:
            omitted_count += 1
            continue
        section_with_separator = f"{separator}{section}"
        if len(section_with_separator) > remaining:
            section_with_separator = section_with_separator[: max(0, remaining)] + "\n[Knowledge context omitted by max_chars budget.]"
            omitted_count += 1
        used_chars += len(section_with_separator)
        sections.append(section_with_separator if not separator else section_with_separator[len(separator):])
        source_refs.append(_source_ref_from_result(result, ordinal=len(source_refs)))
    return "\n\n".join(sections), source_refs, used_chars, omitted_count, warnings


def _render_result_section(result: dict[str, Any]) -> str:
    title = _as_text(result.get("title")) or _as_text(result.get("citation_id")) or "Knowledge chunk"
    section = _as_text(result.get("section"))
    citation = _as_text(result.get("citation_id"))
    source = _as_text(result.get("url")) or _as_text(result.get("source"))
    retrieval = _coerce_dict(result.get("retrieval"))
    retrieval_mode = _as_text(retrieval.get("mode")) or "knowledge"
    content = _as_text(result.get("content")) or _as_text(result.get("summary"))
    lines = [f"Knowledge: {title}"]
    if citation:
        lines.append(f"citation: {citation}")
    if section:
        lines.append(f"section: {section}")
    if source:
        lines.append(f"source: {source}")
    lines.append(f"retrieval: {retrieval_mode}")
    if content:
        lines.append(content)
    return "\n".join(lines)


def _source_ref_from_result(result: dict[str, Any], *, ordinal: int) -> dict[str, Any]:
    content = _as_text(result.get("content"))
    metadata = _coerce_dict(result.get("metadata"))
    retrieval = _coerce_dict(result.get("retrieval"))
    return {
        "source_kind": "knowledge_chunk",
        "source_id": _as_text(result.get("chunk_id")),
        "source_content_hash": _content_hash(content),
        "label": _as_text(result.get("title")),
        "ordinal": ordinal,
        "metadata": {
            "kb_id": _as_text(result.get("kb_id")),
            "kb_label": _as_text(result.get("kb_label")),
            "citation_id": _as_text(result.get("citation_id")),
            "title": _as_text(result.get("title")),
            "section": _as_text(result.get("section")),
            "url": _as_text(result.get("url")) or _as_text(result.get("source")),
            "score": _bounded_float(result.get("score"), default=0.0, minimum=-1_000_000.0, maximum=1_000_000.0),
            "retrieval": retrieval,
            "metadata": metadata,
        },
    }


def _build_context_ref(
    *,
    source_refs: list[dict[str, Any]],
    query: str,
    knowledge_base: str,
    max_chars: int,
    rendered_text: str,
) -> dict[str, Any]:
    if not source_refs:
        return {
            "kind": "context_assembly_ref",
            "assembly_id": "ctx_knowledge_empty",
            "target_state_key": "knowledge_context",
            "renderer_key": "knowledge_context",
            "renderer_version": "1",
            "rendered_content_hash": "",
            "source_count": 0,
            "source_refs": [],
        }
    try:
        from app.core.storage.context_assembly_store import create_context_assembly

        return create_context_assembly(
            target_state_key="knowledge_context",
            renderer_key="knowledge_context",
            renderer_version="1",
            rendered_text=rendered_text,
            sources=source_refs,
            budget={"max_chars": max_chars},
            metadata={
                "scope": "knowledge",
                "query": query,
                "knowledge_base": knowledge_base,
                "context_security_policy": {"block_high_risk": True},
            },
        )
    except Exception:
        source_key = [
            [ref.get("source_kind"), ref.get("source_id"), ref.get("source_content_hash")]
            for ref in source_refs
        ]
        key = json.dumps({"source_refs": source_key, "query": query, "max_chars": max_chars}, ensure_ascii=False, sort_keys=True)
        return {
            "kind": "context_assembly_ref",
            "assembly_id": f"ctx_knowledge_{hashlib.sha256(key.encode('utf-8')).hexdigest()[:16]}",
            "target_state_key": "knowledge_context",
            "renderer_key": "knowledge_context",
            "renderer_version": "1",
            "rendered_content_hash": _content_hash(rendered_text) if rendered_text else "",
            "source_count": len(source_refs),
            "source_refs": source_refs,
            "budget": {"max_chars": max_chars},
            "metadata": {
                "scope": "knowledge",
                "query": query,
                "knowledge_base": knowledge_base,
                "context_security_policy": {"block_high_risk": True},
            },
        }


def _build_context_package(
    *,
    context_ref: dict[str, Any],
    results: list[dict[str, Any]],
    source_refs: list[dict[str, Any]],
    query: str,
    knowledge_base: str,
    max_chars: int,
    used_chars: int,
    source_chars: int,
    omitted_count: int,
    warnings: list[dict[str, Any]],
) -> dict[str, Any]:
    source_by_id = {str(ref.get("source_id") or ""): ref for ref in source_refs}
    items: list[dict[str, Any]] = []
    for result in results:
        chunk_id = _as_text(result.get("chunk_id"))
        source_ref = source_by_id.get(chunk_id)
        if not source_ref:
            continue
        items.append(
            {
                "id": chunk_id,
                "title": _as_text(result.get("title")) or chunk_id,
                "summary": _as_text(result.get("summary")),
                "score": _bounded_float(result.get("score"), default=0.0, minimum=-1_000_000.0, maximum=1_000_000.0),
                "source_ref": source_ref,
                "metadata": {
                    "kb_id": _as_text(result.get("kb_id")),
                    "kb_label": _as_text(result.get("kb_label")),
                    "citation_id": _as_text(result.get("citation_id")),
                    "section": _as_text(result.get("section")),
                    "url": _as_text(result.get("url")) or _as_text(result.get("source")),
                    "retrieval": _coerce_dict(result.get("retrieval")),
                    "metadata": _coerce_dict(result.get("metadata")),
                },
            }
        )
    return {
        "kind": "context_package",
        "package_id": _context_package_id(context_ref),
        "source_kind": "knowledge",
        "authority": "evidence",
        "title": "Knowledge context",
        "items": items,
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
            "renderer_key": "knowledge_context",
            "renderer_version": "1",
            "query": query,
            "knowledge_base": _report_knowledge_base(knowledge_base, results),
        },
    }


def _empty_package(warnings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": "pkg_knowledge_empty",
        "source_kind": "knowledge",
        "authority": "evidence",
        "title": "Knowledge context",
        "items": [],
        "source_refs": [],
        "source_count": 0,
        "context_ref": {
            "kind": "context_assembly_ref",
            "assembly_id": "ctx_knowledge_empty",
            "target_state_key": "knowledge_context",
            "renderer_key": "knowledge_context",
            "renderer_version": "1",
            "rendered_content_hash": "",
            "source_count": 0,
            "source_refs": [],
        },
        "budget": {"source_chars": 0, "used_chars": 0, "omitted_count": 0},
        "warnings": warnings,
        "metadata": {"renderer_key": "knowledge_context", "renderer_version": "1"},
    }


def _report_knowledge_base(knowledge_base: str, results: list[dict[str, Any]]) -> str:
    if knowledge_base:
        return knowledge_base
    if results:
        return _as_text(results[0].get("kb_id"))
    return ""


def _context_ref_rendered_chars(context_ref: dict[str, Any], *, fallback: int) -> int:
    try:
        from app.core.storage.context_assembly_store import expand_context_assembly_ref

        expanded = expand_context_assembly_ref(context_ref)
        return len(str(expanded.get("text") or ""))
    except Exception:
        return fallback


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _context_package_id(context_ref: dict[str, Any]) -> str:
    assembly_id = _as_text(context_ref.get("assembly_id"))
    if assembly_id.startswith("ctx_"):
        return f"pkg_{assembly_id[4:]}"
    if assembly_id:
        return f"pkg_{assembly_id}"
    return "pkg_knowledge_empty"


def _content_hash(text: str) -> str:
    return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


def _warning(code: str, message: str) -> dict[str, Any]:
    return {"code": code, "message": message}


def _coerce_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


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


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


if __name__ == "__main__":
    print(json.dumps(knowledge_context_loader(json.loads(sys.stdin.read() or "{}")), ensure_ascii=False))

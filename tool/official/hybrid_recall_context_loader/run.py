from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_SESSION_LIMIT = 5
DEFAULT_MEMORY_LIMIT = 5
DEFAULT_WINDOW = 2
DEFAULT_BOOKEND = 1
DEFAULT_MAX_CHARS = 10000


def hybrid_recall_context_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    try:
        _ensure_backend_path()
        from app.buddy.store import recall_chat_messages, search_memories

        query = _as_text(inputs.get("query"))
        embedding_model_ref = _as_text(inputs.get("embedding_model_ref"))
        reranker_model_ref = _as_text(inputs.get("reranker_model_ref"))
        current_session_id = _as_text(inputs.get("current_session_id"))
        session_limit = _bounded_int(inputs.get("session_limit"), default=DEFAULT_SESSION_LIMIT, minimum=1, maximum=20)
        memory_limit = _bounded_int(inputs.get("memory_limit"), default=DEFAULT_MEMORY_LIMIT, minimum=1, maximum=20)
        window = _bounded_int(inputs.get("window"), default=DEFAULT_WINDOW, minimum=0, maximum=10)
        bookend = _bounded_int(inputs.get("bookend"), default=DEFAULT_BOOKEND, minimum=0, maximum=10)
        max_chars = _bounded_int(inputs.get("max_chars"), default=DEFAULT_MAX_CHARS, minimum=512, maximum=50000)
        sort = _as_text(inputs.get("sort")) or "rank"
        warnings: list[dict[str, Any]] = []

        if not query:
            warnings.append(_warning("missing_query", "Hybrid recall query is required."))
            package = _empty_package(warnings)
            return {
                "status": "succeeded",
                "hybrid_recall_context": package,
                "hybrid_recall_report": _empty_report(query=query, max_chars=max_chars, warnings=warnings),
            }

        session_result = recall_chat_messages(
            mode="discover",
            query=query,
            current_session_id=current_session_id,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
            limit=session_limit,
            window=window,
            bookend=bookend,
            sort=sort,
            role_filter=inputs.get("role_filter"),
        )
        memory_result = search_memories(
            query=query,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
            scope_kind=_as_text(inputs.get("scope_kind")),
            scope_id=_as_text(inputs.get("scope_id")),
            layer=_as_text(inputs.get("layer")),
            memory_type=_as_text(inputs.get("memory_type")),
            status=_as_text(inputs.get("status")) or "active",
            limit=memory_limit,
        )

        sessions = _list_records(session_result.get("sessions"))
        memories = _list_records(memory_result.get("memories"))
        rendered_text, context_sources, report_sources, results, budget = _render_hybrid_context(
            query=query,
            sessions=sessions,
            memories=memories,
            max_chars=max_chars,
        )
        context_ref = _build_context_ref(
            query=query,
            current_session_id=current_session_id,
            embedding_model_ref=embedding_model_ref,
            reranker_model_ref=reranker_model_ref,
            source_refs=context_sources,
            max_chars=max_chars,
            rendered_text=rendered_text,
        )
        package = _build_context_package(
            query=query,
            context_ref=context_ref,
            source_refs=context_sources,
            max_chars=max_chars,
            budget=budget,
            warnings=warnings,
            session_count=len(sessions),
            memory_count=len(memories),
        )
        return {
            "status": "succeeded",
            "hybrid_recall_context": package,
            "hybrid_recall_report": _build_report(
                query=query,
                embedding_model_ref=embedding_model_ref,
                reranker_model_ref=reranker_model_ref,
                session_result=session_result,
                memory_result=memory_result,
                sessions=sessions,
                memories=memories,
                source_refs=report_sources,
                results=results,
                max_chars=max_chars,
                budget=budget,
                warnings=warnings,
            ),
        }
    except Exception as exc:
        warning = _warning("hybrid_recall_context_load_failed", str(exc))
        return {
            "status": "failed",
            "error_type": "hybrid_recall_context_load_failed",
            "error": str(exc),
            "hybrid_recall_context": _empty_package([warning]),
            "hybrid_recall_report": {
                "scope": "hybrid_recall",
                "source_refs": [],
                "source_count": 0,
                "warnings": [warning],
            },
        }


def _render_hybrid_context(
    *,
    query: str,
    sessions: list[dict[str, Any]],
    memories: list[dict[str, Any]],
    max_chars: int,
) -> tuple[str, list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    sections: list[str] = []
    context_sources: list[dict[str, Any]] = []
    report_sources: list[dict[str, Any]] = []
    results: list[dict[str, Any]] = []
    source_chars = 0
    used_chars = 0
    omitted_count = 0
    seen_messages: set[str] = set()

    for session in sessions:
        session_id = _as_text(session.get("session_id"))
        title = _as_text(session.get("title")) or session_id or "Buddy session"
        lineage_root = _as_text(session.get("lineage_root_session_id") or session.get("parent_session_id") or session_id)
        lines = [
            f"Session: {title}",
            f"session_id: {session_id}",
            f"lineage_root_session_id: {lineage_root}",
        ]
        snippet = _as_text(session.get("snippet"))
        if snippet:
            lines.append(f"hit_snippet: {snippet}")
        for message in _session_messages(session):
            message_id = _as_text(message.get("message_id"))
            content = _as_text(message.get("content"))
            if not message_id or not content or message_id in seen_messages:
                continue
            seen_messages.add(message_id)
            role = _as_text(message.get("role"))
            lines.append(_format_history_line(role, content))
            context_source = {
                "source_kind": "buddy_message",
                "source_id": message_id,
                "role": role,
                "label": title,
                "metadata": {
                    "query": query,
                    "session_id": session_id,
                    "lineage_root_session_id": lineage_root,
                    "created_at": _as_text(message.get("created_at")),
                },
            }
            context_sources.append(context_source)
            report_sources.append({"source_kind": "buddy_message", "source_id": message_id})
            results.append(
                {
                    "kind": "session",
                    "session_id": session_id,
                    "message_id": message_id,
                    "role": role,
                    "content": content,
                    "source_refs": [{"source_kind": "buddy_message", "source_id": message_id}],
                }
            )
        source_chars, used_chars, omitted_count = _append_section(
            sections,
            "\n".join(lines).strip(),
            source_chars=source_chars,
            used_chars=used_chars,
            omitted_count=omitted_count,
            max_chars=max_chars,
        )

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
        context_sources.append(source_ref)
        report_sources.append({"source_kind": "memory_entry", "source_id": memory_id})
        memory_source_refs = [{"source_kind": "memory_entry", "source_id": memory_id}]
        for source in _list_records(memory.get("sources")):
            source_kind = _as_text(source.get("source_kind"))
            source_id = _as_text(source.get("source_id"))
            if source_kind and source_id:
                report_sources.append({"source_kind": source_kind, "source_id": source_id})
                memory_source_refs.append({"source_kind": source_kind, "source_id": source_id})
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
        results.append(
            {
                "kind": "memory",
                "memory_id": memory_id,
                "title": title,
                "content": content,
                "source_refs": _dedupe_sources(memory_source_refs),
            }
        )
        source_chars, used_chars, omitted_count = _append_section(
            sections,
            "\n".join(lines).strip(),
            source_chars=source_chars,
            used_chars=used_chars,
            omitted_count=omitted_count,
            max_chars=max_chars,
        )

    return (
        "\n\n".join(sections),
        _dedupe_sources(context_sources),
        _dedupe_sources(report_sources),
        results,
        {
            "source_chars": source_chars,
            "used_chars": used_chars,
            "context_chars": used_chars,
            "omitted_count": omitted_count,
        },
    )


def _append_section(
    sections: list[str],
    section: str,
    *,
    source_chars: int,
    used_chars: int,
    omitted_count: int,
    max_chars: int,
) -> tuple[int, int, int]:
    if not section:
        return source_chars, used_chars, omitted_count
    source_chars += len(section)
    separator = "\n\n" if sections else ""
    remaining = max_chars - used_chars
    if remaining <= 0:
        return source_chars, used_chars, omitted_count + 1
    section_with_separator = f"{separator}{section}"
    if len(section_with_separator) > remaining:
        section_with_separator = section_with_separator[: max(0, remaining)] + "\n[Hybrid recall context omitted by max_chars budget.]"
        omitted_count += 1
    used_chars += len(section_with_separator)
    sections.append(section_with_separator if not separator else section_with_separator[len(separator):])
    return source_chars, used_chars, omitted_count


def _build_context_ref(
    *,
    query: str,
    current_session_id: str,
    embedding_model_ref: str,
    reranker_model_ref: str,
    source_refs: list[dict[str, Any]],
    max_chars: int,
    rendered_text: str,
) -> dict[str, Any]:
    if not source_refs:
        return _empty_context_ref()
    try:
        from app.core.storage.context_assembly_store import create_context_assembly

        return create_context_assembly(
            target_state_key="hybrid_recall_context",
            renderer_key="hybrid_recall",
            renderer_version="1",
            rendered_text=rendered_text,
            sources=source_refs,
            budget={"max_chars": max_chars},
            metadata={
                "scope": "hybrid_recall",
                "query": query,
                "current_session_id": current_session_id,
                "embedding_model_ref": embedding_model_ref,
                "reranker_model_ref": reranker_model_ref,
            },
        )
    except Exception:
        source_key = [[ref.get("source_kind"), ref.get("source_id")] for ref in source_refs]
        key = json.dumps({"source_refs": source_key, "query": query, "max_chars": max_chars}, ensure_ascii=False, sort_keys=True)
        return {
            "kind": "context_assembly_ref",
            "assembly_id": f"ctx_hybrid_recall_{hashlib.sha256(key.encode('utf-8')).hexdigest()[:16]}",
            "target_state_key": "hybrid_recall_context",
            "renderer_key": "hybrid_recall",
            "renderer_version": "1",
            "rendered_content_hash": _content_hash(rendered_text) if rendered_text else "",
            "source_count": len(source_refs),
            "source_refs": source_refs,
            "budget": {"max_chars": max_chars},
            "metadata": {
                "scope": "hybrid_recall",
                "query": query,
                "current_session_id": current_session_id,
                "embedding_model_ref": embedding_model_ref,
                "reranker_model_ref": reranker_model_ref,
            },
        }


def _build_context_package(
    *,
    query: str,
    context_ref: dict[str, Any],
    source_refs: list[dict[str, Any]],
    max_chars: int,
    budget: dict[str, int],
    warnings: list[dict[str, Any]],
    session_count: int,
    memory_count: int,
) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": _context_package_id(context_ref),
        "source_kind": "memory",
        "authority": "evidence",
        "title": "Hybrid recall context",
        "items": [
            {
                "id": _as_text(source.get("source_id")),
                "title": _as_text(source.get("label")) or _as_text(source.get("source_kind")),
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
            **budget,
        },
        "warnings": warnings,
        "metadata": {
            "renderer_key": "hybrid_recall",
            "renderer_version": "1",
            "query": query,
            "source_kinds": ["session", "memory"],
            "session_count": session_count,
            "memory_count": memory_count,
        },
    }


def _build_report(
    *,
    query: str,
    embedding_model_ref: str,
    reranker_model_ref: str,
    session_result: dict[str, Any],
    memory_result: dict[str, Any],
    sessions: list[dict[str, Any]],
    memories: list[dict[str, Any]],
    source_refs: list[dict[str, Any]],
    results: list[dict[str, Any]],
    max_chars: int,
    budget: dict[str, int],
    warnings: list[dict[str, Any]],
) -> dict[str, Any]:
    memory_report = memory_result.get("report") if isinstance(memory_result.get("report"), dict) else {}
    message_ids = _dedupe(
        [
            _as_text(source.get("source_id"))
            for source in source_refs
            if _as_text(source.get("source_kind")) == "buddy_message" and _as_text(source.get("source_id"))
        ]
    )
    memory_ids = [_as_text(memory.get("memory_id")) for memory in memories if _as_text(memory.get("memory_id"))]
    return {
        "scope": "hybrid_recall",
        "query": query,
        "mode": "hybrid" if embedding_model_ref else ("keyword" if query else "browse"),
        "embedding_model_ref": embedding_model_ref,
        "reranker_model_ref": reranker_model_ref,
        "session_mode": _as_text(session_result.get("retrieval_mode") or session_result.get("mode")),
        "memory_mode": _as_text(memory_report.get("mode")),
        "session_count": len(sessions),
        "memory_count": len(memories),
        "message_ids": message_ids,
        "memory_ids": memory_ids,
        "source_refs": source_refs,
        "source_count": len(source_refs),
        "results": results,
        "retrieval_modes": {
            "session": _as_text(session_result.get("retrieval_mode") or session_result.get("mode")),
            "memory": _as_text(memory_report.get("mode")),
        },
        "query_ids": _dedupe(
            [
                *_list_text(memory_report.get("query_ids")),
                *[
                    _as_text(result.get("retrieval", {}).get("query_id"))
                    for result in results
                    if isinstance(result.get("retrieval"), dict)
                ],
            ]
        ),
        "max_chars": max_chars,
        **budget,
        "warnings": warnings,
    }


def _empty_report(*, query: str, max_chars: int, warnings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "scope": "hybrid_recall",
        "query": query,
        "mode": "browse",
        "session_count": 0,
        "memory_count": 0,
        "message_ids": [],
        "memory_ids": [],
        "source_refs": [],
        "source_count": 0,
        "results": [],
        "max_chars": max_chars,
        "source_chars": 0,
        "used_chars": 0,
        "context_chars": 0,
        "omitted_count": 0,
        "warnings": warnings,
    }


def _empty_package(warnings: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": "pkg_hybrid_recall_empty",
        "source_kind": "memory",
        "authority": "evidence",
        "title": "Hybrid recall context",
        "items": [],
        "source_refs": [],
        "source_count": 0,
        "context_ref": _empty_context_ref(),
        "budget": {"source_chars": 0, "used_chars": 0, "context_chars": 0, "omitted_count": 0},
        "warnings": warnings,
        "metadata": {"renderer_key": "hybrid_recall", "renderer_version": "1"},
    }


def _empty_context_ref() -> dict[str, Any]:
    return {
        "kind": "context_assembly_ref",
        "assembly_id": "ctx_hybrid_recall_empty",
        "target_state_key": "hybrid_recall_context",
        "renderer_key": "hybrid_recall",
        "renderer_version": "1",
        "rendered_content_hash": "",
        "source_count": 0,
        "source_refs": [],
    }


def _session_messages(session: dict[str, Any]) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for key in ("bookend_start", "messages", "bookend_end"):
        messages.extend(_list_records(session.get(key)))
    return messages


def _context_package_id(context_ref: dict[str, Any]) -> str:
    assembly_id = _as_text(context_ref.get("assembly_id"))
    if assembly_id.startswith("ctx_"):
        return f"pkg_{assembly_id[4:]}"
    if assembly_id:
        return f"pkg_{assembly_id}"
    return "pkg_hybrid_recall_empty"


def _format_history_line(role: str, content: str) -> str:
    label = "用户" if role == "user" else "伙伴" if role == "assistant" else "消息"
    return f"{label}: {content.strip()}"


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


def _content_hash(text: str) -> str:
    return f"sha256:{hashlib.sha256(text.encode('utf-8')).hexdigest()}"


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


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = _as_text(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def _list_records(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _list_text(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value.strip() else []
    if not isinstance(value, list):
        return []
    return [_as_text(item) for item in value if _as_text(item)]


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
    print(json.dumps(hybrid_recall_context_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

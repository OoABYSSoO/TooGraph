from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


def buddy_session_recall(**action_inputs: Any) -> dict[str, Any]:
    repo_root = _repo_root()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    from app.buddy import store as buddy_store

    buddy_home_override = _as_text(os.environ.get("TOOGRAPH_BUDDY_HOME_DIR")).strip()
    if buddy_home_override:
        buddy_store.BUDDY_HOME_DIR = Path(buddy_home_override).expanduser().resolve()

    request = _dict(action_inputs.get("recall_request"))
    merged = {**request, **{key: value for key, value in action_inputs.items() if key != "recall_request"}}
    try:
        context = buddy_store.recall_chat_messages(
            mode=_as_text(merged.get("mode")) or "browse",
            query=_as_text(merged.get("query")),
            session_id=_as_text(merged.get("session_id")) or None,
            anchor_message_id=_as_text(merged.get("anchor_message_id")) or None,
            direction=_as_text(merged.get("direction")) or "around",
            limit=_int(merged.get("limit"), default=10),
            window=_int(merged.get("window"), default=5),
            bookend=_int(merged.get("bookend"), default=3),
            sort=_as_text(merged.get("sort")) or "rank",
            role_filter=merged.get("role_filter"),
            current_session_id=_as_text(merged.get("current_session_id")) or None,
        )
        enrichment = _recall_related_sources(context, merged)
    except Exception as exc:
        return {
            "success": False,
            "session_recall_context": _empty_context(),
            "sessions": [],
            "memories": [],
            "run_outputs": [],
            "context_assembly_ref": {},
            "result": f"Buddy session recall failed: {exc}",
            "activity_events": [
                {
                    "kind": "buddy_session_recall",
                    "summary": f"Buddy session recall failed: {exc}",
                    "status": "failed",
                    "detail": {"error": str(exc)},
                    "error": str(exc),
                }
            ],
        }

    sessions = context.get("sessions") if isinstance(context.get("sessions"), list) else []
    context = {**context, "context_sources": enrichment["context_sources"]}
    result_text = _result_text(context)
    return {
        "success": True,
        "session_recall_context": context,
        "sessions": sessions,
        "memories": enrichment["memories"],
        "run_outputs": enrichment["run_outputs"],
        "context_assembly_ref": enrichment["context_assembly_ref"],
        "result": result_text,
        "activity_events": [
            {
                "kind": "buddy_session_recall",
                "summary": result_text,
                "status": "succeeded",
                "detail": {
                    "mode": context.get("mode"),
                    "query": context.get("query"),
                    "session_count": len(sessions),
                    "hit_count": context.get("hit_count", 0),
                },
            }
        ],
    }


def _recall_related_sources(context: dict[str, Any], merged: dict[str, Any]) -> dict[str, Any]:
    query = _as_text(context.get("query")) or _as_text(merged.get("query"))
    limit = _int(merged.get("limit"), default=10)
    memories = _recall_memories(query, limit=limit)
    run_outputs = _recall_run_outputs(query, limit=limit)
    context_sources = _dedupe_sources(
        [
            *_session_context_sources(context),
            *_memory_context_sources(memories),
            *_run_output_context_sources(run_outputs),
        ]
    )
    context_assembly_ref = _create_context_assembly_ref(context_sources)
    return {
        "memories": memories,
        "run_outputs": run_outputs,
        "context_sources": context_sources,
        "context_assembly_ref": context_assembly_ref,
    }


def _recall_memories(query: str, *, limit: int) -> list[dict[str, Any]]:
    if not query:
        return []
    try:
        from app.core.storage.memory_store import recall_memories

        return recall_memories(query, filters={}, limit=limit)
    except Exception:
        return []


def _recall_run_outputs(query: str, *, limit: int) -> list[dict[str, Any]]:
    if not query:
        return []
    try:
        from app.core.storage.retrieval_store import search_retrieval_fts

        return search_retrieval_fts(query, filters={"source_kind": "graph_output"}, limit=limit)
    except Exception:
        return []


def _session_context_sources(context: dict[str, Any]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    sessions = context.get("sessions") if isinstance(context.get("sessions"), list) else []
    for session in sessions:
        session_id = _as_text(session.get("session_id"))
        messages = session.get("messages") if isinstance(session.get("messages"), list) else []
        for message in messages:
            message_id = _as_text(message.get("message_id"))
            if not message_id:
                continue
            sources.append(
                {
                    "source_kind": "buddy_message",
                    "source_id": message_id,
                    "role": _as_text(message.get("role")),
                    "label": session_id,
                    "metadata": {"session_id": session_id},
                }
            )
    return sources


def _memory_context_sources(memories: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for memory in memories:
        memory_id = _as_text(memory.get("memory_id"))
        if not memory_id:
            continue
        sources.append(
            {
                "source_kind": "memory_entry",
                "source_id": memory_id,
                "source_revision_id": _as_text(memory.get("latest_revision_id")),
                "label": _as_text(memory.get("title")),
                "metadata": {"memory_type": _as_text(memory.get("memory_type"))},
            }
        )
    return sources


def _run_output_context_sources(run_outputs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    for output in run_outputs:
        source_ref = output.get("source_ref") if isinstance(output.get("source_ref"), dict) else {}
        source_id = _as_text(source_ref.get("source_id"))
        if not source_id:
            continue
        sources.append(
            {
                "source_kind": "graph_output",
                "source_id": source_id,
                "source_revision_id": _as_text(source_ref.get("source_revision_id")),
                "label": _as_text(output.get("title")),
                "metadata": {"chunk_id": _as_text(output.get("chunk_id"))},
            }
        )
    return sources


def _create_context_assembly_ref(context_sources: list[dict[str, Any]]) -> dict[str, Any]:
    if not context_sources:
        return {}
    try:
        from app.core.storage.context_assembly_store import create_context_assembly

        return create_context_assembly(
            target_state_key="session_recall_context",
            renderer_key="buddy_session_recall",
            renderer_version="1",
            rendered_text="",
            sources=context_sources,
            metadata={"kind": "buddy_session_recall"},
        )
    except Exception:
        return {
            "kind": "context_assembly_ref",
            "target_state_key": "session_recall_context",
            "source_refs": context_sources,
        }


def _dedupe_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for source in sources:
        key = (
            _as_text(source.get("source_kind")),
            _as_text(source.get("source_id")),
            _as_text(source.get("source_revision_id")),
        )
        if not key[0] or not key[1] or key in seen:
            continue
        deduped.append(source)
        seen.add(key)
    return deduped


def _empty_context() -> dict[str, Any]:
    return {
        "kind": "buddy_session_recall",
        "mode": "browse",
        "query": "",
        "hit_count": 0,
        "session_count": 0,
        "sessions": [],
    }


def _result_text(context: dict[str, Any]) -> str:
    session_count = int(context.get("session_count") or len(context.get("sessions") or []))
    hit_count = int(context.get("hit_count") or 0)
    session_word = "session" if session_count == 1 else "sessions"
    if context.get("mode") == "discover":
        return f"Recalled {session_count} {session_word} from Buddy history with {hit_count} message hit(s)."
    return f"Recalled {session_count} {session_word} from Buddy history."


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _int(value: Any, *, default: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _repo_root() -> Path:
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[3]


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(buddy_session_recall(**payload), ensure_ascii=False))

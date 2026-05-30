from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_SUMMARY_PLACEHOLDERS = {"当前对话尚未形成摘要。"}


def buddy_history_context_loader(payload: dict[str, Any] | None, *, context: dict[str, Any] | None = None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    runtime_context = _resolve_runtime_context(inputs=inputs, explicit_context=context)
    session_id = _text(
        runtime_context.get("buddy_session_id")
        or runtime_context.get("current_session_id")
        or inputs.get("buddy_session_id")
        or inputs.get("current_session_id")
    )
    current_message_id = _text(
        runtime_context.get("buddy_current_message_id")
        or runtime_context.get("current_message_id")
        or inputs.get("buddy_current_message_id")
        or inputs.get("current_message_id")
    )
    source_run_id = _resolve_source_run_id(inputs=inputs, runtime_context=runtime_context, explicit_context=context)

    if not session_id:
        warnings = [_warning("missing_buddy_session", "No Buddy session runtime context was available.")]
        context_ref = _build_context_ref(
            session_id="",
            current_message_id=current_message_id,
            source_run_id=source_run_id,
            source_refs=[],
            scope="standalone_run",
        )
        return {
            "status": "succeeded",
            "conversation_history": _build_context_package(
                session_id="",
                current_message_id=current_message_id,
                context_ref=context_ref,
                source_refs=[],
                source_chars=0,
                used_chars=0,
                omitted_count=0,
                source_run_id=source_run_id,
                warnings=warnings,
            ),
        }

    try:
        _ensure_backend_path()
        from app.buddy.store import list_chat_messages

        messages = list_chat_messages(session_id)
        session_summary = _load_latest_session_summary(session_id)
    except Exception as exc:
        warning = _warning("history_load_failed", str(exc))
        context_ref = _build_context_ref(
            session_id=session_id,
            current_message_id=current_message_id,
            source_run_id=source_run_id,
            source_refs=[],
            scope="load_failed",
        )
        return {
            "status": "failed",
            "error_type": "history_load_failed",
            "error": str(exc),
            "conversation_history": _build_context_package(
                session_id=session_id,
                current_message_id=current_message_id,
                context_ref=context_ref,
                source_refs=[],
                source_chars=0,
                used_chars=0,
                omitted_count=0,
                source_run_id=source_run_id,
                warnings=[warning],
            ),
        }

    visible_messages = _visible_messages_before_current(messages, current_message_id=current_message_id)
    summary_content = _text(session_summary.get("content") if isinstance(session_summary, dict) else "")
    if summary_content in DEFAULT_SUMMARY_PLACEHOLDERS:
        summary_content = ""
    if summary_content:
        selected_messages = _messages_after_summary(visible_messages, session_summary=session_summary)
        history_view = "compacted"
        summary_id = _text(session_summary.get("summary_id"))
        omitted_count = max(0, len(visible_messages) - len(selected_messages))
        source_refs = [_summary_source_ref(session_summary), *_build_source_refs(selected_messages)]
    else:
        selected_messages = visible_messages
        history_view = "raw"
        summary_id = ""
        omitted_count = 0
        source_refs = _build_source_refs(selected_messages)
    source_refs = [{**ref, "ordinal": index} for index, ref in enumerate(source_refs)]

    ref = _build_context_ref(
        session_id=session_id,
        current_message_id=current_message_id,
        source_run_id=source_run_id,
        source_refs=source_refs,
        scope="buddy_session_compacted" if history_view == "compacted" else "buddy_session",
        history_view=history_view,
        summary_id=summary_id,
    )
    rendered_text = _render_history_text(summary_content=summary_content, messages=selected_messages)
    source_chars = len(summary_content) + _messages_char_count(visible_messages)
    return {
        "status": "succeeded",
        "conversation_history": _build_context_package(
            session_id=session_id,
            current_message_id=current_message_id,
            context_ref=ref,
            source_refs=source_refs,
            source_chars=source_chars,
            used_chars=len(rendered_text),
            omitted_count=omitted_count,
            source_run_id=source_run_id,
            history_view=history_view,
            summary_id=summary_id,
            warnings=[],
        ),
    }


def _resolve_runtime_context(*, inputs: dict[str, Any], explicit_context: dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(explicit_context, dict):
        nested = explicit_context.get("runtime_context")
        action_nested = explicit_context.get("action_runtime_context")
        if isinstance(nested, dict):
            return nested
        if isinstance(action_nested, dict):
            return action_nested
        return explicit_context
    env_context = _read_json_env("TOOGRAPH_ACTION_RUNTIME_CONTEXT")
    if env_context:
        return env_context
    file_path = _text(os.environ.get("TOOGRAPH_ACTION_RUNTIME_CONTEXT_FILE"))
    if file_path:
        try:
            value = json.loads(Path(file_path).read_text(encoding="utf-8"))
        except Exception:
            value = {}
        if isinstance(value, dict):
            return value
    input_context = inputs.get("runtime_context")
    return input_context if isinstance(input_context, dict) else {}


def _resolve_source_run_id(
    *,
    inputs: dict[str, Any],
    runtime_context: dict[str, Any],
    explicit_context: dict[str, Any] | None,
) -> str:
    if isinstance(explicit_context, dict):
        explicit_run_id = _text(explicit_context.get("run_id"))
        if explicit_run_id:
            return explicit_run_id
    return _text(inputs.get("source_run_id") or runtime_context.get("source_run_id") or runtime_context.get("run_id"))


def _load_latest_session_summary(session_id: str) -> dict[str, Any]:
    if not session_id:
        return {}
    _ensure_backend_path()
    from app.core.storage.database import get_connection

    lineage_root = _resolve_lineage_root(session_id)
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT summary_id, session_id, lineage_root_session_id, content, source_refs_json,
                   source_run_id, source_revision_id, created_at, updated_at
            FROM buddy_session_summaries
            WHERE session_id = ?
               OR lineage_root_session_id = ?
            ORDER BY updated_at DESC, rowid DESC
            LIMIT 1
            """,
            (session_id, lineage_root or session_id),
        ).fetchone()
    if row is None:
        return {}
    return {
        "summary_id": _text(row["summary_id"]),
        "session_id": _text(row["session_id"]),
        "lineage_root_session_id": _text(row["lineage_root_session_id"]),
        "content": _text(row["content"]),
        "source_refs": _json_list(row["source_refs_json"]),
        "source_run_id": _text(row["source_run_id"]),
        "source_revision_id": _text(row["source_revision_id"]),
        "created_at": _text(row["created_at"]),
        "updated_at": _text(row["updated_at"]),
    }


def _resolve_lineage_root(session_id: str) -> str:
    _ensure_backend_path()
    from app.core.storage.database import get_connection

    visited: set[str] = set()
    current = session_id
    with get_connection() as connection:
        while current and current not in visited:
            visited.add(current)
            row = connection.execute(
                "SELECT parent_session_id FROM buddy_sessions WHERE session_id = ?",
                (current,),
            ).fetchone()
            if row is None:
                return session_id
            parent = _text(row["parent_session_id"])
            if not parent:
                return current
            current = parent
    return current or session_id


def _json_list(raw: Any) -> list[dict[str, Any]]:
    try:
        value = json.loads(str(raw or "[]"))
    except Exception:
        value = []
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _messages_after_summary(
    messages: list[dict[str, Any]],
    *,
    session_summary: dict[str, Any],
) -> list[dict[str, Any]]:
    covered_message_ids = {
        _text(ref.get("source_id"))
        for ref in session_summary.get("source_refs", [])
        if isinstance(ref, dict) and ref.get("source_kind") == "buddy_message" and _text(ref.get("source_id"))
    }
    if covered_message_ids:
        last_covered_index = max(
            (index for index, message in enumerate(messages) if _text(message.get("message_id")) in covered_message_ids),
            default=-1,
        )
        if last_covered_index >= 0:
            return messages[last_covered_index + 1 :]
    summary_updated_at = _text(session_summary.get("updated_at"))
    if summary_updated_at:
        return [_ for _ in messages if _text(_.get("created_at")) > summary_updated_at]
    return []


def _read_json_env(key: str) -> dict[str, Any]:
    raw = _text(os.environ.get(key))
    if not raw:
        return {}
    try:
        value = json.loads(raw)
    except Exception:
        return {}
    return value if isinstance(value, dict) else {}


def _visible_messages_before_current(
    messages: list[dict[str, Any]],
    *,
    current_message_id: str,
) -> list[dict[str, Any]]:
    visible = [
        message
        for message in messages
        if message.get("include_in_context", True) is not False and _text(message.get("content"))
    ]
    if current_message_id:
        current_index = next(
            (index for index, message in enumerate(visible) if _text(message.get("message_id")) == current_message_id),
            -1,
        )
        if current_index >= 0:
            visible = visible[:current_index]
    return visible


def _build_source_refs(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for message in messages:
        refs.append(
            {
                "source_kind": "buddy_message",
                "source_id": _text(message.get("message_id")),
                "role": _text(message.get("role")),
                "ordinal": len(refs),
            }
        )
    return refs


def _build_context_ref(
    *,
    session_id: str,
    current_message_id: str,
    source_run_id: str,
    source_refs: list[dict[str, Any]],
    scope: str,
    history_view: str = "raw",
    summary_id: str = "",
) -> dict[str, Any]:
    source_key = [
        [ref.get("source_kind"), ref.get("source_id"), ref.get("role"), ref.get("ordinal")]
        for ref in source_refs
    ]
    assembly_key = json.dumps(
        {
            "session_id": session_id,
            "current_message_id": current_message_id,
            "source_refs": source_key,
            "scope": scope,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    assembly_hash = hashlib.sha256(assembly_key.encode("utf-8")).hexdigest()[:16]
    preview = "no buddy session history" if not source_refs else f"context assembly sources: {len(source_refs)}"
    return {
        "kind": "context_assembly_ref",
        "assembly_id": f"ctx_buddy_history_{assembly_hash}",
        "target_state_key": "conversation_history",
        "renderer_key": "buddy_history",
        "renderer_version": "1",
        "rendered_content_hash": "",
        "source_count": len(source_refs),
        "source_refs": source_refs,
        "budget": {"source_count": len(source_refs)},
        "metadata": {
            "scope": scope,
            "current_session_id": session_id,
            "current_message_id": current_message_id,
            "source_run_id": source_run_id,
            "history_view": history_view,
            "summary_id": summary_id,
        },
        "preview": preview,
    }


def _build_context_package(
    *,
    session_id: str,
    current_message_id: str,
    context_ref: dict[str, Any],
    source_refs: list[dict[str, Any]],
    source_chars: int,
    used_chars: int,
    omitted_count: int,
    source_run_id: str,
    history_view: str = "raw",
    summary_id: str = "",
    warnings: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "kind": "context_package",
        "package_id": _context_package_id(context_ref),
        "source_kind": "session",
        "authority": "history",
        "title": "Buddy conversation history",
        "items": _build_context_package_items(source_refs),
        "source_refs": source_refs,
        "source_count": len(source_refs),
        "context_ref": context_ref,
        "budget": {
            "source_chars": source_chars,
            "used_chars": used_chars,
            "omitted_count": omitted_count,
        },
        "warnings": warnings,
        "metadata": {
            "current_session_id": session_id,
            "current_message_id": current_message_id,
            "source_run_id": source_run_id,
            "history_view": history_view,
            "summary_id": summary_id,
            "renderer_key": "buddy_history",
            "renderer_version": "1",
        },
    }


def _summary_source_ref(session_summary: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_kind": "buddy_session_summary",
        "source_id": _text(session_summary.get("summary_id")),
        "source_revision_id": _text(session_summary.get("source_revision_id")),
        "session_id": _text(session_summary.get("session_id")),
        "lineage_root_session_id": _text(session_summary.get("lineage_root_session_id")),
        "source_run_id": _text(session_summary.get("source_run_id")),
        "role": "summary",
    }


def _context_package_id(context_ref: dict[str, Any]) -> str:
    assembly_id = _text(context_ref.get("assembly_id"))
    if assembly_id.startswith("ctx_"):
        return f"pkg_{assembly_id[4:]}"
    return f"pkg_{assembly_id or 'buddy_history'}"


def _build_context_package_items(source_refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for source_ref in source_refs:
        source_id = _text(source_ref.get("source_id"))
        source_kind = _text(source_ref.get("source_kind"))
        role = _text(source_ref.get("role"))
        title = "已有会话摘要" if source_kind == "buddy_session_summary" else _message_title(role)
        items.append(
            {
                "id": source_id,
                "title": title,
                "source_ref": source_ref,
                "metadata": {
                    "source_kind": source_kind,
                    "role": role,
                    "ordinal": source_ref.get("ordinal"),
                },
            }
        )
    return items


def _message_title(role: str) -> str:
    if role == "user":
        return "用户消息"
    if role == "assistant":
        return "伙伴消息"
    return "会话消息"


def _render_history_text(*, summary_content: str, messages: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    if summary_content:
        lines.append("已有会话摘要:")
        lines.append(summary_content)
    for message in messages:
        role = _text(message.get("role"))
        content = _text(message.get("content"))
        if content:
            lines.append(_format_history_line(role, content))
    return "\n".join(lines)


def _format_history_line(role: str, content: str) -> str:
    label = "用户" if role == "user" else "伙伴" if role == "assistant" else "消息"
    return f"{label}: {content.strip()}"


def _warning(code: str, message: str) -> dict[str, Any]:
    return {"code": code, "message": message}


def _messages_char_count(messages: list[dict[str, Any]]) -> int:
    return sum(len(_text(message.get("content"))) for message in messages)


def _text(value: Any) -> str:
    return str(value or "").strip()


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


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
    print(json.dumps(buddy_history_context_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


def buddy_message_source_loader(payload: dict[str, Any] | None) -> dict[str, Any]:
    inputs = payload if isinstance(payload, dict) else {}
    session_id = _as_text(inputs.get("session_id"))
    if not session_id:
        return _failed("missing_session_id", "session_id is required.")

    try:
        _ensure_backend_path()
        from app.buddy import store

        session = store.get_chat_session(session_id)
        limit = _bounded_int(inputs.get("limit"), default=200, minimum=1, maximum=10_000)
        after_client_order = _bounded_float(
            inputs.get("after_client_order"),
            default=-1.0,
            minimum=-1_000_000_000.0,
            maximum=1_000_000_000.0,
        )
        messages = [
            _message_payload(message)
            for message in store.list_chat_messages(session_id, limit=None)
            if _message_client_order(message) > after_client_order
        ][:limit]
        source_refs = [_message_source_ref(message) for message in messages]
        next_after_client_order = max((_message_client_order(message) for message in messages), default=after_client_order)
        package = {
            "kind": "buddy_message_source_package",
            "source_kind": "buddy_messages",
            "source_id": session_id,
            "session_id": session_id,
            "title": _as_text(session.get("title")) or session_id,
            "messages": messages,
            "message_count": len(messages),
            "source_refs": source_refs,
            "scope": {
                "session_id": session_id,
            },
            "metadata": {
                "loader": "buddy_message_source_loader",
                "session_id": session_id,
                "message_count": len(messages),
                "limit": limit,
                "after_client_order": after_client_order,
            },
        }
        return {
            "status": "succeeded",
            "source_package": package,
            "message_count": len(messages),
            "next_after_client_order": _number_for_json(next_after_client_order),
        }
    except KeyError:
        return _failed("session_not_found", f"Buddy session '{session_id}' does not exist.")
    except Exception as exc:
        return _failed("buddy_message_source_load_failed", str(exc))


def _message_payload(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "message_id": _as_text(message.get("message_id")),
        "session_id": _as_text(message.get("session_id")),
        "role": _as_text(message.get("role")),
        "content": str(message.get("content") or ""),
        "client_order": _number_for_json(_message_client_order(message)),
        "include_in_context": bool(message.get("include_in_context", True)),
        "run_id": _as_text(message.get("run_id")),
        "metadata": _coerce_dict(message.get("metadata")),
        "created_at": _as_text(message.get("created_at")),
        "updated_at": _as_text(message.get("updated_at")),
    }


def _message_source_ref(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "source_kind": "buddy_message",
        "source_id": _as_text(message.get("message_id")),
        "session_id": _as_text(message.get("session_id")),
        "role": _as_text(message.get("role")),
        "client_order": _number_for_json(_message_client_order(message)),
    }


def _message_client_order(message: dict[str, Any]) -> float:
    try:
        return float(message.get("client_order"))
    except (TypeError, ValueError):
        return 0.0


def _failed(error_type: str, message: str) -> dict[str, Any]:
    return {
        "status": "failed",
        "error_type": error_type,
        "error": message,
        "source_package": {
            "kind": "buddy_message_source_package",
            "source_kind": "buddy_messages",
            "source_id": "",
            "session_id": "",
            "messages": [],
            "message_count": 0,
            "source_refs": [],
            "scope": {},
            "metadata": {},
        },
        "message_count": 0,
        "next_after_client_order": None,
    }


def _ensure_backend_path() -> None:
    repo_root = Path(os.environ.get("TOOGRAPH_REPO_ROOT") or Path(__file__).resolve().parents[3]).resolve()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))


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


def _number_for_json(value: float) -> int | float:
    return int(value) if float(value).is_integer() else value


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
    print(json.dumps(buddy_message_source_loader(payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

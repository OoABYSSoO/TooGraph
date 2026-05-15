from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


def buddy_session_recall(**skill_inputs: Any) -> dict[str, Any]:
    repo_root = _repo_root()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    from app.buddy import store as buddy_store

    buddy_home_override = _as_text(os.environ.get("TOOGRAPH_BUDDY_HOME_DIR")).strip()
    if buddy_home_override:
        buddy_store.BUDDY_HOME_DIR = Path(buddy_home_override).expanduser().resolve()

    request = _dict(skill_inputs.get("recall_request"))
    merged = {**request, **{key: value for key, value in skill_inputs.items() if key != "recall_request"}}
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
    except Exception as exc:
        return {
            "success": False,
            "session_recall_context": _empty_context(),
            "sessions": [],
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
    result_text = _result_text(context)
    return {
        "success": True,
        "session_recall_context": context,
        "sessions": sessions,
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

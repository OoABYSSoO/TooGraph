from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


DEFAULT_TOP_K = 8
MAX_TOP_K = 50
DEFAULT_MAX_CHARS = 4000
MAX_CONTEXT_CHARS = 20000


def memory_recall(**skill_inputs: Any) -> dict[str, Any]:
    repo_root = _repo_root()
    backend_path = repo_root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    from app.memory import store

    query = _as_text(skill_inputs.get("query")).strip()
    scope = _optional_filter(skill_inputs.get("scope"))
    layer = _optional_filter(skill_inputs.get("layer"))
    memory_type = _optional_filter(skill_inputs.get("memory_type"))
    status = _optional_filter(skill_inputs.get("status")) or "active"
    top_k = _bounded_int(skill_inputs.get("top_k"), default=DEFAULT_TOP_K, minimum=1, maximum=MAX_TOP_K)
    max_chars = _bounded_int(
        skill_inputs.get("max_chars"),
        default=DEFAULT_MAX_CHARS,
        minimum=1,
        maximum=MAX_CONTEXT_CHARS,
    )

    try:
        recalled = store.recall_memories(
            query=query,
            scope=scope,
            layer=layer,
            memory_type=memory_type,
            status=status,
            top_k=top_k,
            max_chars=max_chars,
        )
    except Exception as exc:
        return _failed(str(exc))

    memory_context = {
        "kind": "memory_context",
        "query": recalled["query"],
        "filters": {
            "scope": recalled["scope"],
            "layer": recalled["layer"],
            "type": recalled["type"],
            "status": recalled["status"],
        },
        "max_chars": recalled["max_chars"],
        "used_chars": recalled["used_chars"],
        "total_count": recalled["total_count"],
        "included_count": recalled["included_count"],
        "omitted_count": recalled["omitted_count"],
        "memories": recalled["memories"],
        "omitted": recalled["omitted"],
    }
    result_text = (
        f"Recalled {recalled['included_count']} memories"
        f" ({recalled['omitted_count']} omitted by budget)."
    )
    return {
        "success": True,
        "memory_context": memory_context,
        "recalled_memories": recalled["memories"],
        "omitted_memories": recalled["omitted"],
        "result": result_text,
        "activity_events": [
            {
                "kind": "memory_recall",
                "summary": result_text,
                "status": "succeeded",
                "detail": {
                    "query": query,
                    "scope": scope or "",
                    "layer": layer or "",
                    "memory_type": memory_type or "",
                    "memory_status": status,
                    "top_k": top_k,
                    "max_chars": max_chars,
                    "included_count": recalled["included_count"],
                    "omitted_count": recalled["omitted_count"],
                    "memory_ids": [memory.get("id") for memory in recalled["memories"]],
                },
            }
        ],
    }


def _failed(error: str) -> dict[str, Any]:
    return {
        "success": False,
        "memory_context": {
            "kind": "memory_context",
            "query": "",
            "filters": {},
            "max_chars": DEFAULT_MAX_CHARS,
            "used_chars": 0,
            "total_count": 0,
            "included_count": 0,
            "omitted_count": 0,
            "memories": [],
            "omitted": [],
        },
        "recalled_memories": [],
        "omitted_memories": [],
        "result": f"memory_recall failed: {error}",
        "activity_events": [
            {
                "kind": "memory_recall",
                "summary": "Memory recall failed.",
                "status": "failed",
                "detail": {"error": error},
                "error": error,
            }
        ],
    }


def _optional_filter(value: Any) -> str | None:
    text = _as_text(value).strip().lower().replace(" ", "_")
    if not text:
        return None
    return "".join(char if char.isalnum() or char in {"_", "-"} else "_" for char in text)


def _bounded_int(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(parsed, maximum))


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(memory_recall(**payload), ensure_ascii=False))

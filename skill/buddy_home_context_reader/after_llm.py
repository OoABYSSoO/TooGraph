from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


DEFAULT_PROFILE = {
    "name": "GraphiteUI Buddy",
    "persona": "GraphiteUI 的全局主伙伴 Agent。",
    "tone": "简短、直接、友好。",
    "response_style": "默认先给结论，再给必要理由。",
    "display_preferences": {},
}

DEFAULT_POLICY = {
    "graph_permission_mode": "advisory",
    "behavior_boundaries": [
        "不能越过当前图操作档位。",
        "不能声称已经执行未执行的图操作。",
    ],
    "communication_preferences": [],
}

DEFAULT_SESSION_SUMMARY = {
    "content": "当前对话尚未形成摘要。",
    "updated_at": "",
}

MAX_INCLUDED_MEMORIES = 20
MAX_MEMORY_CONTENT_CHARS = 1200


def buddy_home_context_reader(**_skill_inputs: Any) -> dict[str, Any]:
    repo_root = _resolve_repo_root()
    buddy_root = repo_root / "backend" / "data" / "buddy"
    warnings: list[str] = []

    profile = _read_json_object(
        buddy_root / "profile.json",
        default=DEFAULT_PROFILE,
        label="profile",
        warnings=warnings,
    )
    policy = _read_json_object(
        buddy_root / "policy.json",
        default=DEFAULT_POLICY,
        label="policy",
        warnings=warnings,
    )
    memories = _read_json_list(
        buddy_root / "memories.json",
        label="memories",
        warnings=warnings,
    )
    session_summary = _read_json_object(
        buddy_root / "session_summary.json",
        default=DEFAULT_SESSION_SUMMARY,
        label="session_summary",
        warnings=warnings,
    )

    included_memories = _compact_memories(memories)
    return {
        "context_pack": {
            "profile": profile,
            "policy": policy,
            "memories": included_memories,
            "session_summary": session_summary,
            "meta": {
                "memory_count": len(memories),
                "included_memory_count": len(included_memories),
                "warnings": warnings,
            },
        }
    }


def _read_json_object(
    path: Path,
    *,
    default: dict[str, Any],
    label: str,
    warnings: list[str],
) -> dict[str, Any]:
    payload = _read_json(path, default=default, label=label, warnings=warnings)
    if isinstance(payload, dict):
        return payload
    warnings.append(f"{label} must be a JSON object; using default.")
    return dict(default)


def _read_json_list(path: Path, *, label: str, warnings: list[str]) -> list[dict[str, Any]]:
    payload = _read_json(path, default=[], label=label, warnings=warnings)
    if not isinstance(payload, list):
        warnings.append(f"{label} must be a JSON array; using empty list.")
        return []
    return [item for item in payload if isinstance(item, dict)]


def _read_json(path: Path, *, default: Any, label: str, warnings: list[str]) -> Any:
    if not path.is_file():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        warnings.append(f"Could not read {label}: {exc}")
        return default


def _compact_memories(memories: list[dict[str, Any]]) -> list[dict[str, Any]]:
    visible = [
        memory
        for memory in memories
        if memory.get("enabled", True) and not memory.get("deleted", False)
    ]
    compacted: list[dict[str, Any]] = []
    for memory in visible[:MAX_INCLUDED_MEMORIES]:
        compacted.append(
            {
                "id": _as_text(memory.get("id")),
                "type": _as_text(memory.get("type") or "fact"),
                "title": _as_text(memory.get("title") or "Untitled memory"),
                "content": _truncate(_as_text(memory.get("content")), MAX_MEMORY_CONTENT_CHARS),
                "confidence": memory.get("confidence", 1),
                "updated_at": _as_text(memory.get("updated_at")),
            }
        )
    return compacted


def _truncate(value: str, max_chars: int) -> str:
    if len(value) <= max_chars:
        return value
    return value[:max_chars].rstrip() + "\n[truncated]"


def _as_text(value: Any) -> str:
    return str(value or "").strip()


def _resolve_repo_root() -> Path:
    configured = os.environ.get("GRAPHITE_REPO_ROOT")
    if configured:
        return Path(configured).expanduser().resolve()
    return Path(__file__).resolve().parents[2]


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(buddy_home_context_reader(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

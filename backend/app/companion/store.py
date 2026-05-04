from __future__ import annotations

from copy import deepcopy
from typing import Any
from uuid import uuid4

from app.core.storage.database import DATA_DIR
from app.core.storage.json_file_utils import read_json_file, utc_now_iso, write_json_file


COMPANION_DATA_DIR = DATA_DIR / "companion"
PROFILE_PATH = "profile.json"
POLICY_PATH = "policy.json"
MEMORIES_PATH = "memories.json"
SESSION_SUMMARY_PATH = "session_summary.json"
REVISIONS_PATH = "revisions.json"

DEFAULT_PROFILE = {
    "name": "GraphiteUI Companion",
    "persona": "GraphiteUI 的全局主桌宠 Agent。",
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

TRANSIENT_MARKERS = (
    "base64,",
    "data:image/",
    "data:video/",
    "data:audio/",
    "data:application/",
    "临时",
    "一次性",
    "下载这个",
    "报错全文",
)
PREFERENCE_MARKERS = (
    "以后",
    "总是",
    "默认",
    "我希望",
    "我喜欢",
    "回答我",
    "先给结论",
    "不要",
    "记住",
)


def load_profile() -> dict[str, Any]:
    return _read_dict(PROFILE_PATH, DEFAULT_PROFILE)


def save_profile(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_profile()
    next_value = {**previous, **_clean_dict(payload)}
    _write_with_revision("profile", "profile", "update", previous, next_value, changed_by, change_reason)
    _write_json(PROFILE_PATH, next_value)
    return load_profile()


def load_policy() -> dict[str, Any]:
    return _read_dict(POLICY_PATH, DEFAULT_POLICY)


def save_policy(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_policy()
    next_value = {**previous, **_clean_dict(payload), "graph_permission_mode": "advisory"}
    _write_with_revision("policy", "policy", "update", previous, next_value, changed_by, change_reason)
    _write_json(POLICY_PATH, next_value)
    return load_policy()


def list_memories(*, include_deleted: bool = False) -> list[dict[str, Any]]:
    memories = _read_list(MEMORIES_PATH)
    if include_deleted:
        return memories
    return [memory for memory in memories if memory.get("enabled", True) and not memory.get("deleted", False)]


def create_memory(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    memories = _read_list(MEMORIES_PATH)
    now = utc_now_iso()
    memory = {
        "id": f"mem_{uuid4().hex[:12]}",
        "type": str(payload.get("type") or "fact").strip() or "fact",
        "title": str(payload.get("title") or "Untitled memory").strip() or "Untitled memory",
        "content": str(payload.get("content") or "").strip(),
        "source": payload.get("source") if isinstance(payload.get("source"), dict) else {"kind": "manual", "message_ids": []},
        "confidence": float(payload.get("confidence") or 1),
        "enabled": bool(payload.get("enabled", True)),
        "deleted": False,
        "created_at": now,
        "updated_at": now,
    }
    memories.append(memory)
    _write_with_revision("memory", memory["id"], "create", {}, memory, changed_by, change_reason)
    _write_json(MEMORIES_PATH, memories)
    return memory


def update_memory(memory_id: str, payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    memories = _read_list(MEMORIES_PATH)
    index = _find_memory_index(memories, memory_id)
    previous = deepcopy(memories[index])
    next_value = {**previous, **_clean_dict(payload), "updated_at": utc_now_iso()}
    memories[index] = next_value
    _write_with_revision("memory", memory_id, "update", previous, next_value, changed_by, change_reason)
    _write_json(MEMORIES_PATH, memories)
    return next_value


def delete_memory(memory_id: str, *, changed_by: str, change_reason: str) -> dict[str, Any]:
    return update_memory(memory_id, {"enabled": False, "deleted": True}, changed_by=changed_by, change_reason=change_reason)


def load_session_summary() -> dict[str, Any]:
    summary = _read_dict(SESSION_SUMMARY_PATH, DEFAULT_SESSION_SUMMARY)
    if not summary.get("updated_at"):
        summary["updated_at"] = utc_now_iso()
    return summary


def save_session_summary(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_session_summary()
    next_value = {**previous, "content": str(payload.get("content") or "").strip(), "updated_at": utc_now_iso()}
    _write_with_revision("session_summary", "session_summary", "update", previous, next_value, changed_by, change_reason)
    _write_json(SESSION_SUMMARY_PATH, next_value)
    return load_session_summary()


def curate_memory_from_turn(user_message: str, assistant_reply: str, *, changed_by: str = "memory_curator") -> dict[str, Any]:
    normalized = f"{user_message}\n{assistant_reply}".strip()
    normalized_lower = normalized.lower()
    if not normalized or any(marker in normalized_lower for marker in TRANSIENT_MARKERS):
        return {"created": [], "updated": [], "skipped": True}
    if not any(marker in normalized for marker in PREFERENCE_MARKERS):
        return {"created": [], "updated": [], "skipped": True}

    content = _summarize_memory_content(user_message)
    existing = _find_similar_enabled_memory(content)
    if existing:
        updated = update_memory(
            existing["id"],
            {"content": content, "confidence": max(float(existing.get("confidence") or 0), 0.75)},
            changed_by=changed_by,
            change_reason="自动记忆整理更新已有记忆。",
        )
        return {"created": [], "updated": [updated], "skipped": False}

    created = create_memory(
        {
            "type": "preference",
            "title": "用户偏好",
            "content": content,
            "confidence": 0.75,
            "source": {"kind": "companion_chat", "message_ids": []},
        },
        changed_by=changed_by,
        change_reason="自动记忆整理。",
    )
    return {"created": [created], "updated": [], "skipped": False}


def list_revisions(target_type: str | None = None, target_id: str | None = None) -> list[dict[str, Any]]:
    revisions = _read_list(REVISIONS_PATH)
    if target_type:
        revisions = [revision for revision in revisions if revision.get("target_type") == target_type]
    if target_id:
        revisions = [revision for revision in revisions if revision.get("target_id") == target_id]
    return revisions


def restore_revision(revision_id: str, *, changed_by: str, change_reason: str) -> dict[str, Any]:
    revision = next((item for item in _read_list(REVISIONS_PATH) if item.get("revision_id") == revision_id), None)
    if not revision:
        raise KeyError(revision_id)
    target_type = str(revision["target_type"])
    target_id = str(revision["target_id"])
    restored = deepcopy(revision.get("previous_value") or {})
    if target_type == "profile":
        current = load_profile()
        _write_with_revision("profile", "profile", "restore", current, restored, changed_by, change_reason)
        _write_json(PROFILE_PATH, restored)
    elif target_type == "policy":
        current = load_policy()
        restored["graph_permission_mode"] = "advisory"
        _write_with_revision("policy", "policy", "restore", current, restored, changed_by, change_reason)
        _write_json(POLICY_PATH, restored)
    elif target_type == "memory":
        memories = _read_list(MEMORIES_PATH)
        index = _find_memory_index(memories, target_id)
        current = deepcopy(memories[index])
        restored = {**restored, "updated_at": utc_now_iso(), "deleted": False, "enabled": True}
        memories[index] = restored
        _write_with_revision("memory", target_id, "restore", current, restored, changed_by, change_reason)
        _write_json(MEMORIES_PATH, memories)
    elif target_type == "session_summary":
        current = load_session_summary()
        _write_with_revision("session_summary", "session_summary", "restore", current, restored, changed_by, change_reason)
        _write_json(SESSION_SUMMARY_PATH, restored)
    else:
        raise ValueError(f"Unsupported revision target type: {target_type}")
    return {"target_type": target_type, "target_id": target_id, "current_value": restored}


def _write_with_revision(
    target_type: str,
    target_id: str,
    operation: str,
    previous_value: dict[str, Any],
    next_value: dict[str, Any],
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    revisions = _read_list(REVISIONS_PATH)
    revision = {
        "revision_id": f"rev_{uuid4().hex[:12]}",
        "target_type": target_type,
        "target_id": target_id,
        "operation": operation,
        "previous_value": deepcopy(previous_value),
        "next_value": deepcopy(next_value),
        "changed_by": changed_by,
        "change_reason": change_reason,
        "created_at": utc_now_iso(),
    }
    revisions.append(revision)
    _write_json(REVISIONS_PATH, revisions)
    return revision


def _read_dict(file_name: str, default: dict[str, Any]) -> dict[str, Any]:
    value = read_json_file(COMPANION_DATA_DIR / file_name, default=deepcopy(default))
    return value if isinstance(value, dict) else deepcopy(default)


def _read_list(file_name: str) -> list[dict[str, Any]]:
    value = read_json_file(COMPANION_DATA_DIR / file_name, default=[])
    return value if isinstance(value, list) else []


def _write_json(file_name: str, payload: Any) -> None:
    write_json_file(COMPANION_DATA_DIR / file_name, payload)


def _find_memory_index(memories: list[dict[str, Any]], memory_id: str) -> int:
    for index, memory in enumerate(memories):
        if memory.get("id") == memory_id:
            return index
    raise KeyError(memory_id)


def _summarize_memory_content(user_message: str) -> str:
    return user_message.strip()[:300]


def _find_similar_enabled_memory(content: str) -> dict[str, Any] | None:
    for memory in list_memories():
        if memory.get("type") == "preference" and str(memory.get("title")) == "用户偏好":
            if str(memory.get("content"))[:24] == content[:24]:
                return memory
    return None


def _clean_dict(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}

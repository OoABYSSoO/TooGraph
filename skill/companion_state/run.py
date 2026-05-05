from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sys
from typing import Any
from uuid import uuid4


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

PROFILE_PATH = "profile.json"
POLICY_PATH = "policy.json"
MEMORIES_PATH = "memories.json"
SESSION_SUMMARY_PATH = "session_summary.json"
REVISIONS_PATH = "revisions.json"

TRANSIENT_MARKERS = (
    "data:image/",
    "data:video/",
    "data:audio/",
    "data:application/",
    "临时",
    "一次性",
    "下载这个",
    "报错全文",
)
PREFERENCE_MARKERS = ("以后", "总是", "默认", "我希望", "我喜欢", "回答我", "先给结论", "不要", "记住")
PERMISSION_ESCALATION_MARKERS = (
    "所有权限",
    "无需人类确认",
    "不需要人类确认",
    "无需审批",
    "不用审批",
    "不加限制",
    "无限制",
    "直接新建",
    "直接修改图",
    "直接操作图",
)
RESPONSE_STYLE_MARKERS = ("回答", "回复", "说话", "表达", "先给结论", "简短", "详细")
GRAPH_BOUNDARY_MARKERS = ("图", "节点", "新建", "修改", "删除", "操作")
INJECTION_PATTERNS = (
    re.compile(r"ignore\s+(previous|all|above|prior)\s+instructions", re.IGNORECASE),
    re.compile(r"disregard\s+(your|all|any)\s+(instructions|rules|guidelines)", re.IGNORECASE),
    re.compile(r"system\s+prompt\s+override", re.IGNORECASE),
    re.compile(r"curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)", re.IGNORECASE),
    re.compile(r"wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)", re.IGNORECASE),
    re.compile(r"cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)", re.IGNORECASE),
)
COMPANION_NAME_PATTERNS = (
    re.compile(r"(?:你)?以后(?:就)?叫(?P<name>[\w\u4e00-\u9fffA-Za-z0-9_-]{1,24})"),
    re.compile(r"(?:以后|从现在开始).*?(?:你的)?(?:名字|名称).*?(?:叫|改成|是)(?P<name>[\w\u4e00-\u9fffA-Za-z0-9_-]{1,24})"),
    re.compile(r"(?:叫你|称呼你为)(?P<name>[\w\u4e00-\u9fffA-Za-z0-9_-]{1,24})"),
)


def main() -> None:
    payload = _read_stdin_payload()
    operation = str(payload.get("operation") or "load_context").strip()
    try:
        if operation == "load_context":
            result = load_context()
        elif operation == "curate_turn":
            result = {
                "status": "succeeded",
                "memory_update_result": curate_turn(
                    str(payload.get("user_message") or ""),
                    str(payload.get("assistant_reply") or ""),
                ),
            }
        else:
            result = {"status": "failed", "error": f"Unsupported operation: {operation}"}
    except Exception as exc:
        if operation == "load_context":
            result = {
                **default_context_result(),
                "status": "failed",
                "error": str(exc),
            }
        elif operation == "curate_turn":
            result = {
                "status": "failed",
                "error": str(exc),
                "memory_update_result": empty_curator_result(curator_plan("error", [], [str(exc)])),
            }
        else:
            result = {"status": "failed", "error": str(exc)}
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


def load_context() -> dict[str, Any]:
    profile = load_profile()
    policy = load_policy()
    memories = list_memories()
    session_summary = load_session_summary()
    return {
        "status": "succeeded",
        "profile": f"<companion-profile>\n{format_profile_for_prompt(profile)}\n</companion-profile>",
        "policy": f"<companion-policy>\n{format_policy_for_prompt(policy)}\n</companion-policy>",
        "memory_context": f"<memory-context>\n{format_memories_for_prompt(memories)}\n</memory-context>",
        "session_summary": f"<session-summary>\n{str(session_summary.get('content') or '').strip()}\n</session-summary>",
        "snapshot": {
            "profile": profile,
            "policy": policy,
            "memories": memories,
            "session_summary": session_summary,
        },
        "warnings": [],
    }


def default_context_result() -> dict[str, Any]:
    return {
        "profile": "<companion-profile>\n未配置桌宠人设。\n</companion-profile>",
        "policy": "<companion-policy>\n未配置桌宠行为边界。\n</companion-policy>",
        "memory_context": "<memory-context>\n暂无长期记忆。\n</memory-context>",
        "session_summary": "<session-summary>\n暂无会话摘要。\n</session-summary>",
        "snapshot": {},
        "warnings": [],
    }


def curate_turn(user_message: str, assistant_reply: str) -> dict[str, Any]:
    plan = build_curator_plan(user_message, assistant_reply)
    result = empty_curator_result(plan)
    if not plan["actions"]:
        return result

    profile_patch: dict[str, Any] = {}
    policy = load_policy()
    policy_patch: dict[str, Any] = {}
    created: list[dict[str, Any]] = []
    updated: list[dict[str, Any]] = []

    for action in plan["actions"]:
        target = action.get("target")
        if target == "profile":
            profile_patch.update(action.get("patch") if isinstance(action.get("patch"), dict) else {})
        elif target == "policy":
            patch = action.get("patch") if isinstance(action.get("patch"), dict) else {}
            policy_patch = merge_policy_patch(policy, policy_patch, patch)
        elif target == "memory":
            memory_payload = action.get("payload") if isinstance(action.get("payload"), dict) else {}
            content = str(memory_payload.get("content") or "").strip()
            if not content or contains_unsafe_memory_content(content):
                result["warnings"].append("已跳过不适合写入长期记忆的内容。")
                continue
            existing = find_similar_enabled_memory(content)
            if existing:
                memory = update_memory(
                    existing["id"],
                    {"content": content, "confidence": max(float(existing.get("confidence") or 0), 0.8)},
                    changed_by="companion_state_skill",
                    change_reason=str(action.get("reason") or "图模板整理并更新已有记忆。"),
                )
                updated.append(memory)
            else:
                memory = create_memory(
                    {
                        "type": memory_payload.get("type") or "fact",
                        "title": memory_payload.get("title") or "长期记忆",
                        "content": content,
                        "confidence": float(memory_payload.get("confidence") or 0.8),
                        "source": {"kind": "companion_chat_graph", "message_ids": []},
                    },
                    changed_by="companion_state_skill",
                    change_reason=str(action.get("reason") or "图模板自动整理记忆。"),
                )
                created.append(memory)

    if profile_patch:
        result["profile_updated"] = save_profile(
            profile_patch,
            changed_by="companion_state_skill",
            change_reason="图模板整理桌宠人设。",
        )
    if policy_patch:
        result["policy_updated"] = save_policy(
            policy_patch,
            changed_by="companion_state_skill",
            change_reason="图模板整理桌宠行为边界与沟通偏好。",
        )

    result["created"] = created
    result["updated"] = updated
    result["skipped"] = not bool(created or updated or result["profile_updated"] or result["policy_updated"])
    return result


def build_curator_plan(user_message: str, assistant_reply: str) -> dict[str, Any]:
    normalized = f"{user_message}\n{assistant_reply}".strip()
    if not normalized:
        return curator_plan("empty", [], ["空对话不写入记忆。"])
    if is_transient_content(normalized):
        return curator_plan("transient", [], ["临时内容、下载内容或内联媒体内容不写入记忆。"])
    if contains_unsafe_memory_content(normalized):
        return curator_plan("unsafe", [], ["疑似提示词注入或凭据外泄内容不写入记忆。"])

    user_text = user_message.strip()
    if contains_permission_escalation(user_text):
        return curator_plan("permission_escalation", [], ["桌宠档位不能通过对话升级。"])

    actions: list[dict[str, Any]] = []
    companion_name = extract_companion_name(user_text)
    if companion_name:
        actions.append(
            {
                "target": "profile",
                "patch": {"name": companion_name},
                "reason": "用户明确要求更新桌宠名字。",
                "confidence": 0.95,
            }
        )

    if is_response_style_preference(user_text):
        actions.append(
            {
                "target": "policy",
                "patch": {"communication_preferences": [user_text]},
                "reason": "用户表达了长期回复风格偏好。",
                "confidence": 0.9,
            }
        )
    elif is_graph_behavior_boundary(user_text):
        actions.append(
            {
                "target": "policy",
                "patch": {"behavior_boundaries": [user_text]},
                "reason": "用户表达了长期图操作边界。",
                "confidence": 0.85,
            }
        )

    if not companion_name and not is_response_style_preference(user_text) and not is_graph_behavior_boundary(user_text):
        memory_payload = build_memory_payload(user_text)
        if memory_payload:
            actions.append(
                {
                    "target": "memory",
                    "payload": memory_payload,
                    "reason": "自动整理长期用户记忆。",
                    "confidence": memory_payload["confidence"],
                }
            )

    return curator_plan("rule", actions, [])


def load_profile() -> dict[str, Any]:
    return read_dict(PROFILE_PATH, DEFAULT_PROFILE)


def save_profile(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_profile()
    next_value = {**previous, **clean_dict(payload)}
    write_with_revision("profile", "profile", "update", previous, next_value, changed_by, change_reason)
    write_json(PROFILE_PATH, next_value)
    return load_profile()


def load_policy() -> dict[str, Any]:
    return read_dict(POLICY_PATH, DEFAULT_POLICY)


def save_policy(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    previous = load_policy()
    next_value = {**previous, **clean_dict(payload), "graph_permission_mode": "advisory"}
    write_with_revision("policy", "policy", "update", previous, next_value, changed_by, change_reason)
    write_json(POLICY_PATH, next_value)
    return load_policy()


def list_memories(*, include_deleted: bool = False) -> list[dict[str, Any]]:
    memories = read_list(MEMORIES_PATH)
    if include_deleted:
        return memories
    return [memory for memory in memories if memory.get("enabled", True) and not memory.get("deleted", False)]


def create_memory(payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    memories = read_list(MEMORIES_PATH)
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
    write_with_revision("memory", memory["id"], "create", {}, memory, changed_by, change_reason)
    write_json(MEMORIES_PATH, memories)
    return memory


def update_memory(memory_id: str, payload: dict[str, Any], *, changed_by: str, change_reason: str) -> dict[str, Any]:
    memories = read_list(MEMORIES_PATH)
    index = find_memory_index(memories, memory_id)
    previous = deepcopy(memories[index])
    next_value = {**previous, **clean_dict(payload), "updated_at": utc_now_iso()}
    memories[index] = next_value
    write_with_revision("memory", memory_id, "update", previous, next_value, changed_by, change_reason)
    write_json(MEMORIES_PATH, memories)
    return next_value


def load_session_summary() -> dict[str, Any]:
    summary = read_dict(SESSION_SUMMARY_PATH, DEFAULT_SESSION_SUMMARY)
    if not summary.get("updated_at"):
        summary["updated_at"] = utc_now_iso()
    return summary


def write_with_revision(
    target_type: str,
    target_id: str,
    operation: str,
    previous_value: dict[str, Any],
    next_value: dict[str, Any],
    changed_by: str,
    change_reason: str,
) -> dict[str, Any]:
    revisions = read_list(REVISIONS_PATH)
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
    write_json(REVISIONS_PATH, revisions)
    return revision


def empty_curator_result(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "created": [],
        "updated": [],
        "profile_updated": None,
        "policy_updated": None,
        "session_summary_updated": None,
        "skipped": True,
        "plan": plan,
        "warnings": list(plan.get("warnings") if isinstance(plan.get("warnings"), list) else []),
    }


def curator_plan(source: str, actions: list[dict[str, Any]], warnings: list[str]) -> dict[str, Any]:
    return {
        "source": source,
        "actions": actions,
        "warnings": warnings,
    }


def is_transient_content(value: str) -> bool:
    normalized = value.lower()
    return any(marker in normalized for marker in TRANSIENT_MARKERS)


def contains_unsafe_memory_content(value: str) -> bool:
    if any(char in value for char in ("\u200b", "\u200c", "\u200d", "\u2060", "\ufeff")):
        return True
    return any(pattern.search(value) for pattern in INJECTION_PATTERNS)


def contains_permission_escalation(value: str) -> bool:
    return any(marker in value for marker in PERMISSION_ESCALATION_MARKERS)


def extract_companion_name(value: str) -> str:
    if "你" not in value and "桌宠" not in value:
        return ""
    for pattern in COMPANION_NAME_PATTERNS:
        match = pattern.search(value)
        if not match:
            continue
        name = clean_short_text(match.group("name"))
        if name and name not in {"我", "用户", "桌宠", "助手", "agent", "Agent"}:
            return name
    return ""


def clean_short_text(value: str) -> str:
    return value.strip().strip("。.!！?？,，；;：:、'\"“”‘’（）()[]{}<>《》").removesuffix("吧").removesuffix("了").strip()


def is_response_style_preference(value: str) -> bool:
    if not any(marker in value for marker in ("以后", "总是", "默认", "我希望", "回答我", "不要")):
        return False
    return any(marker in value for marker in RESPONSE_STYLE_MARKERS)


def is_graph_behavior_boundary(value: str) -> bool:
    if not any(marker in value for marker in ("不要", "不能", "只能", "禁止", "需要")):
        return False
    return any(marker in value for marker in GRAPH_BOUNDARY_MARKERS)


def build_memory_payload(value: str) -> dict[str, Any] | None:
    if not any(marker in value for marker in PREFERENCE_MARKERS):
        return None
    content = value.strip()[:300]
    if not content:
        return None
    memory_type = "preference" if any(marker in value for marker in ("我喜欢", "我希望", "偏好", "默认", "不要")) else "fact"
    title = "用户偏好" if memory_type == "preference" else "长期事实"
    return {
        "type": memory_type,
        "title": title,
        "content": content,
        "confidence": 0.8,
    }


def merge_policy_patch(current_policy: dict[str, Any], pending_patch: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(pending_patch)
    for key in ("behavior_boundaries", "communication_preferences"):
        incoming_items = incoming.get(key)
        if not isinstance(incoming_items, list):
            continue
        base_items = merged.get(key)
        if not isinstance(base_items, list):
            base_items = current_policy.get(key) if isinstance(current_policy.get(key), list) else []
        merged[key] = merge_unique_strings(base_items, incoming_items)
    return merged


def merge_unique_strings(base_items: list[Any], incoming_items: list[Any]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for item in [*base_items, *incoming_items]:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        merged.append(text[:300])
    return merged


def format_profile_for_prompt(profile: dict[str, Any]) -> str:
    lines = [
        f"名字: {profile.get('name') or ''}",
        f"人设: {profile.get('persona') or ''}",
        f"语气: {profile.get('tone') or ''}",
        f"回复风格: {profile.get('response_style') or ''}",
    ]
    return "\n".join(line.strip() for line in lines if not line.strip().endswith(":"))


def format_policy_for_prompt(policy: dict[str, Any]) -> str:
    boundaries = policy.get("behavior_boundaries") if isinstance(policy.get("behavior_boundaries"), list) else []
    preferences = policy.get("communication_preferences") if isinstance(policy.get("communication_preferences"), list) else []
    lines = [
        f"图操作档位: {policy.get('graph_permission_mode') or 'advisory'}",
        "行为边界:",
        *[f"- {boundary}" for boundary in boundaries if str(boundary).strip()],
        "沟通偏好:",
        *[f"- {preference}" for preference in preferences if str(preference).strip()],
    ]
    return "\n".join(lines)


def format_memories_for_prompt(memories: list[dict[str, Any]]) -> str:
    if not memories:
        return "暂无长期记忆。"
    lines = []
    for memory in memories[:20]:
        memory_type = str(memory.get("type") or "fact").strip()
        title = str(memory.get("title") or "记忆").strip()
        content = str(memory.get("content") or "").strip()
        if content:
            lines.append(f"- [{memory_type}] {title}: {content}")
    return "\n".join(lines) if lines else "暂无长期记忆。"


def find_similar_enabled_memory(content: str) -> dict[str, Any] | None:
    for memory in list_memories():
        if memory.get("type") == "preference" and str(memory.get("title")) == "用户偏好":
            if str(memory.get("content"))[:24] == content[:24]:
                return memory
    return None


def find_memory_index(memories: list[dict[str, Any]], memory_id: str) -> int:
    for index, memory in enumerate(memories):
        if memory.get("id") == memory_id:
            return index
    raise KeyError(memory_id)


def read_dict(file_name: str, default: dict[str, Any]) -> dict[str, Any]:
    value = read_json(data_dir() / file_name, deepcopy(default))
    return value if isinstance(value, dict) else deepcopy(default)


def read_list(file_name: str) -> list[dict[str, Any]]:
    value = read_json(data_dir() / file_name, [])
    return value if isinstance(value, list) else []


def read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return deepcopy(default)


def write_json(file_name: str, payload: Any) -> None:
    target = data_dir() / file_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean_dict(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if value is not None}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def data_dir() -> Path:
    override = os.environ.get("GRAPHITE_COMPANION_DATA_DIR", "").strip()
    if override:
        return Path(override).resolve()
    skill_dir = Path(os.environ.get("GRAPHITE_SKILL_DIR") or Path(__file__).resolve().parent).resolve()
    repo_root = skill_dir.parents[1]
    return repo_root / "backend" / "data" / "companion"


def _read_stdin_payload() -> dict[str, Any]:
    raw = sys.stdin.read().strip()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


if __name__ == "__main__":
    main()

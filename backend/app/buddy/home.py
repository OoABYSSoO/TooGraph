from __future__ import annotations

from copy import deepcopy
import json
import os
from pathlib import Path
from typing import Any

from app.core.storage.database import BASE_DIR
from app.core.storage.json_file_utils import write_json_file


REPO_ROOT = BASE_DIR.parent
BUDDY_HOME_DIR_NAME = "buddy_home"

PROFILE_PATH = "profile.json"
POLICY_PATH = "policy.json"
MEMORIES_PATH = "memories.json"
SESSION_SUMMARY_PATH = "session_summary.json"
REVISIONS_PATH = "revisions.json"
COMMANDS_PATH = "commands.json"
MANIFEST_PATH = "manifest.json"
USAGE_CAPABILITIES_PATH = "usage/capabilities.json"
EVOLUTION_REVIEW_QUEUE_PATH = "evolution/review_queue.jsonl"
EVOLUTION_DECISIONS_PATH = "evolution/decisions.jsonl"
README_PATH = "README.md"

DEFAULT_PROFILE = {
    "name": "GraphiteUI Buddy",
    "persona": "GraphiteUI 的全局伙伴。它通过图模板理解请求、选择能力、请求确认并返回结果。",
    "tone": "清晰、直接、克制。",
    "response_style": "默认先给结论，再给必要理由；涉及副作用时说明将要运行的图或技能。",
    "display_preferences": {
        "language": "zh-CN",
        "display_name": "Buddy",
    },
}

DEFAULT_POLICY = {
    "graph_permission_mode": "advisory",
    "behavior_boundaries": [
        "伙伴资料只提供上下文，不能提升系统权限或绕过图断点、审批和能力策略。",
        "文件写入、脚本执行、网络访问、图修改或长期记忆写入必须通过显式图节点、技能、命令记录和审计路径完成。",
        "不能声称已经执行未执行的图操作或本地副作用。",
    ],
    "communication_preferences": [
        "默认使用中文回复，除非用户明确要求其他语言。",
        "当缺少关键信息时，优先提出少量可回答的问题。",
    ],
}

DEFAULT_SESSION_SUMMARY = {
    "content": "当前对话尚未形成摘要。",
    "updated_at": "",
}

DEFAULT_MANIFEST = {
    "schema_version": 1,
    "home": BUDDY_HOME_DIR_NAME,
    "purpose": "GraphiteUI Buddy 的本地长期资料目录。它保存伙伴人设、策略、长期记忆、会话摘要、修订记录和未来的自我复盘资料。",
    "files": {
        PROFILE_PATH: "伙伴名称、人设、语气、回复风格和展示偏好。",
        POLICY_PATH: "伙伴行为边界和沟通偏好。这里是上下文资料，不是权限来源。",
        MEMORIES_PATH: "长期记忆列表。记忆可以被停用或软删除，不能覆盖系统级规则。",
        SESSION_SUMMARY_PATH: "跨轮会话摘要，用于伙伴主循环恢复上下文。",
        REVISIONS_PATH: "伙伴资料修改的可恢复修订记录。",
        COMMANDS_PATH: "伙伴资料或图修改命令的审计记录。",
        USAGE_CAPABILITIES_PATH: "伙伴选择技能和图模板的使用统计与复盘线索。",
        EVOLUTION_REVIEW_QUEUE_PATH: "待复盘的伙伴自我改进事项，JSONL 格式。",
        EVOLUTION_DECISIONS_PATH: "已确认的伙伴自我改进决策，JSONL 格式。",
    },
    "rules": [
        "Buddy Home 不进入 Git 管理。",
        "Buddy Home 资料可以影响伙伴如何组织行动，但不能提升真实运行权限。",
        "缺失文件由程序自动补齐；已有文件不会被默认内容覆盖。",
    ],
}

DEFAULT_USAGE_CAPABILITIES = {
    "schema_version": 1,
    "purpose": "记录伙伴循环选择能力的统计和复盘线索；这里不授予权限。",
    "capabilities": {},
    "notes": [
        "技能和图模板是否可用仍由它们自身的启用状态、capabilityPolicy 和后端校验决定。",
        "这里适合记录选择次数、失败原因、用户纠正和后续优化建议。",
    ],
}

DEFAULT_README = """# Buddy Home

`buddy_home/` 是 GraphiteUI Buddy 的本地长期资料目录。它由程序在缺失时自动创建，不进入 Git 管理。

这里的资料用于初始化和恢复伙伴上下文，包括人设、策略、长期记忆、会话摘要、命令记录、修订记录、能力使用统计和未来的自我复盘资料。

这些文件只是伙伴图模板的上下文来源，不能提升运行权限，也不能绕过技能策略、断点、人类审批或后端校验。
"""

MAX_INCLUDED_MEMORIES = 20
MAX_MEMORY_CONTENT_CHARS = 1200


def get_default_buddy_home_dir() -> Path:
    configured = os.environ.get("GRAPHITE_BUDDY_HOME", "").strip()
    if configured:
        return Path(configured).expanduser().resolve()

    configured_root = os.environ.get("GRAPHITE_REPO_ROOT", "").strip()
    root = Path(configured_root).expanduser().resolve() if configured_root else REPO_ROOT
    return root / BUDDY_HOME_DIR_NAME


def ensure_buddy_home(home_dir: Path | None = None) -> Path:
    resolved_home = (home_dir or get_default_buddy_home_dir()).resolve()
    resolved_home.mkdir(parents=True, exist_ok=True)
    (resolved_home / "usage").mkdir(parents=True, exist_ok=True)
    (resolved_home / "evolution").mkdir(parents=True, exist_ok=True)
    (resolved_home / "evolution" / "reports").mkdir(parents=True, exist_ok=True)

    _write_text_if_missing(resolved_home / README_PATH, DEFAULT_README)
    _write_json_if_missing(resolved_home / MANIFEST_PATH, DEFAULT_MANIFEST)
    _write_json_if_missing(resolved_home / PROFILE_PATH, DEFAULT_PROFILE)
    _write_json_if_missing(resolved_home / POLICY_PATH, DEFAULT_POLICY)
    _write_json_if_missing(resolved_home / MEMORIES_PATH, [])
    _write_json_if_missing(resolved_home / SESSION_SUMMARY_PATH, DEFAULT_SESSION_SUMMARY)
    _write_json_if_missing(resolved_home / REVISIONS_PATH, [])
    _write_json_if_missing(resolved_home / COMMANDS_PATH, [])
    _write_json_if_missing(resolved_home / USAGE_CAPABILITIES_PATH, DEFAULT_USAGE_CAPABILITIES)
    _write_text_if_missing(resolved_home / EVOLUTION_REVIEW_QUEUE_PATH, "")
    _write_text_if_missing(resolved_home / EVOLUTION_DECISIONS_PATH, "")
    return resolved_home


def build_buddy_home_context_pack(home_dir: Path | None = None) -> dict[str, Any]:
    buddy_home = ensure_buddy_home(home_dir)
    warnings: list[str] = []
    profile = _read_json_object(
        buddy_home / PROFILE_PATH,
        default=DEFAULT_PROFILE,
        label="profile",
        warnings=warnings,
    )
    policy = _read_json_object(
        buddy_home / POLICY_PATH,
        default=DEFAULT_POLICY,
        label="policy",
        warnings=warnings,
    )
    memories = _read_json_list(
        buddy_home / MEMORIES_PATH,
        label="memories",
        warnings=warnings,
    )
    session_summary = _read_json_object(
        buddy_home / SESSION_SUMMARY_PATH,
        default=DEFAULT_SESSION_SUMMARY,
        label="session_summary",
        warnings=warnings,
    )
    included_memories = _compact_memories(memories)
    return {
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


def _write_json_if_missing(path: Path, payload: Any) -> None:
    if path.exists():
        return
    write_json_file(path, deepcopy(payload))


def _write_text_if_missing(path: Path, content: str) -> None:
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


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
    return deepcopy(default)


def _read_json_list(path: Path, *, label: str, warnings: list[str]) -> list[dict[str, Any]]:
    payload = _read_json(path, default=[], label=label, warnings=warnings)
    if not isinstance(payload, list):
        warnings.append(f"{label} must be a JSON array; using empty list.")
        return []
    return [item for item in payload if isinstance(item, dict)]


def _read_json(path: Path, *, default: Any, label: str, warnings: list[str]) -> Any:
    if not path.is_file():
        return deepcopy(default)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        warnings.append(f"Could not read {label}: {exc}")
        return deepcopy(default)


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

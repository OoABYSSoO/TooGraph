from __future__ import annotations

import json
import sys
from typing import Any


SUPPORTED_CURSOR_LIFECYCLES = {"keep", "return_after_step", "return_at_end"}
SUPPORTED_COMMANDS = {
    "click app.nav.home": {
        "target_id": "app.nav.home",
        "target_label": "首页",
        "next_page_path": "/",
    },
    "click app.nav.editor": {
        "target_id": "app.nav.editor",
        "target_label": "图编辑器",
        "next_page_path": "/editor",
    },
    "click app.nav.runs": {
        "target_id": "app.nav.runs",
        "target_label": "运行历史",
        "next_page_path": "/runs",
    },
    "click app.nav.library": {
        "target_id": "app.nav.library",
        "target_label": "图库",
        "next_page_path": "/library",
    },
    "click app.nav.presets": {
        "target_id": "app.nav.presets",
        "target_label": "预设节点",
        "next_page_path": "/presets",
    },
    "click app.nav.skills": {
        "target_id": "app.nav.skills",
        "target_label": "技能",
        "next_page_path": "/skills",
    },
    "click app.nav.models": {
        "target_id": "app.nav.models",
        "target_label": "模型",
        "next_page_path": "/models",
    },
    "click app.nav.modelLogs": {
        "target_id": "app.nav.modelLogs",
        "target_label": "模型日志",
        "next_page_path": "/model-logs",
    },
    "click app.nav.settings": {
        "target_id": "app.nav.settings",
        "target_label": "设置",
        "next_page_path": "/settings",
    },
}
BUDDY_SELF_TARGETS = {
    "app.nav.buddy",
    "buddy",
    "nav.buddy",
    "伙伴",
    "伙伴页面",
    "buddy page",
    "buddy.widget",
    "buddy.avatar",
    "mascot",
    "debug",
    "调试",
}


def toograph_page_operator(**skill_inputs: Any) -> dict[str, Any]:
    commands = _normalize_commands(skill_inputs.get("commands"))
    cursor_lifecycle = _normalize_cursor_lifecycle(skill_inputs.get("cursor_lifecycle"))
    reason = _compact_text(skill_inputs.get("reason"))

    if not commands:
        return _failed(
            code="missing_commands",
            message="页面操作器需要 commands 数组，且命令必须来自页面操作书。",
            recoverable=True,
        )
    if len(commands) != 1:
        return _failed(
            code="unsupported_command_sequence",
            message="页面操作器第一阶段一次只支持一条命令。",
            recoverable=True,
            detail={"commands": commands},
        )

    command = commands[0]
    parsed = _parse_command(command)
    if not parsed:
        return _failed(
            code="invalid_command",
            message="页面操作命令格式无效。请使用页面操作书中的命令字符串，例如 click app.nav.library。",
            recoverable=True,
            detail={"commands": commands},
        )

    action, target_id = parsed
    if _is_self_surface_target(target_id):
        return _failed(
            code="forbidden_self_surface",
            message="伙伴不能操作伙伴页面、伙伴浮窗或自己的形象。",
            recoverable=False,
            detail={"commands": commands, "target_id": target_id},
        )
    if action != "click":
        return _failed(
            code="unsupported_action",
            message="TooGraph 页面操作器第一阶段只支持 click 命令。",
            recoverable=True,
            detail={"commands": commands},
        )
    command_info = SUPPORTED_COMMANDS.get(command)
    if not command_info:
        return _failed(
            code="unsupported_target",
            message="TooGraph 页面操作器第一阶段只支持普通应用导航目标。",
            recoverable=True,
            detail={"commands": commands, "target_id": target_id},
        )

    operation = {
        "kind": "click",
        "target_id": command_info["target_id"],
        "target_label": command_info["target_label"],
    }
    operation_request = {
        "version": 1,
        "commands": commands,
        "operations": [operation],
        "cursor_lifecycle": cursor_lifecycle,
        "next_page_path": command_info["next_page_path"],
        "reason": reason,
    }
    journal_entry = {
        "kind": "click",
        "command": command,
        "target_id": command_info["target_id"],
        "target_label": command_info["target_label"],
        "status": "requested",
        "next_page_path": command_info["next_page_path"],
        "reason": reason,
    }
    return {
        "ok": True,
        "next_page_path": command_info["next_page_path"],
        "cursor_session_id": "",
        "journal": [journal_entry],
        "error": None,
        "activity_events": [
            {
                "kind": "virtual_ui_operation",
                "summary": f"Requested virtual click on {command_info['target_label']}.",
                "status": "requested",
                "detail": {
                    "commands": commands,
                    "operation_request": operation_request,
                    "operation": operation,
                    "cursor_lifecycle": cursor_lifecycle,
                    "next_page_path": command_info["next_page_path"],
                    "journal": [journal_entry],
                    "reason": reason,
                },
            }
        ],
    }


def _failed(*, code: str, message: str, recoverable: bool, detail: dict[str, Any] | None = None) -> dict[str, Any]:
    error = {
        "code": code,
        "message": message,
        "recoverable": recoverable,
    }
    event_detail = {"error": error}
    if detail:
        event_detail.update(detail)
    return {
        "ok": False,
        "next_page_path": "",
        "cursor_session_id": "",
        "journal": [],
        "error": error,
        "status": "failed",
        "error_type": code,
        "activity_events": [
            {
                "kind": "virtual_ui_operation",
                "summary": message,
                "status": "failed",
                "detail": event_detail,
                "error": message,
            }
        ],
    }


def _normalize_commands(value: Any) -> list[str]:
    if isinstance(value, dict):
        return _normalize_commands(value.get("commands"))
    if isinstance(value, str):
        command = _compact_text(value)
        return [command] if command else []
    if not isinstance(value, list):
        return []
    commands: list[str] = []
    for item in value:
        command = _compact_text(item)
        if command:
            commands.append(command)
    return commands


def _parse_command(command: str) -> tuple[str, str] | None:
    parts = command.strip().split(maxsplit=1)
    if len(parts) != 2:
        return None
    return parts[0].lower(), parts[1].strip()


def _is_self_surface_target(target_id: str) -> bool:
    normalized = target_id.strip().lower()
    return (
        normalized in BUDDY_SELF_TARGETS
        or normalized.startswith("buddy.")
        or normalized == "app.nav.buddy"
        or "mascot" in normalized
        or "debug" in normalized
        or "伙伴" in normalized
        or "调试" in normalized
    )


def _normalize_cursor_lifecycle(value: Any) -> str:
    normalized = _compact_text(value).lower().replace("-", "_")
    if normalized in SUPPORTED_CURSOR_LIFECYCLES:
        return normalized
    return "return_after_step"


def _compact_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(toograph_page_operator(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

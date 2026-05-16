from __future__ import annotations

import json
import os
import sys
from typing import Any


SUPPORTED_CURSOR_LIFECYCLES = {"keep", "return_after_step", "return_at_end"}
KNOWN_CLICK_TARGETS = {
    "click app.nav.home": {
        "target_id": "app.nav.home",
        "target_label": "首页",
    },
    "click app.nav.editor": {
        "target_id": "app.nav.editor",
        "target_label": "图编辑器",
    },
    "click app.nav.runs": {
        "target_id": "app.nav.runs",
        "target_label": "运行历史",
    },
    "click app.nav.library": {
        "target_id": "app.nav.library",
        "target_label": "图库",
    },
    "click app.nav.presets": {
        "target_id": "app.nav.presets",
        "target_label": "预设节点",
    },
    "click app.nav.skills": {
        "target_id": "app.nav.skills",
        "target_label": "技能",
    },
    "click app.nav.models": {
        "target_id": "app.nav.models",
        "target_label": "模型",
    },
    "click app.nav.modelLogs": {
        "target_id": "app.nav.modelLogs",
        "target_label": "模型日志",
    },
    "click app.nav.settings": {
        "target_id": "app.nav.settings",
        "target_label": "设置",
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
    graph_edit_intents = _normalize_graph_edit_intents(skill_inputs.get("graph_edit_intents"))
    cursor_lifecycle = _normalize_cursor_lifecycle(skill_inputs.get("cursor_lifecycle"))
    reason = _compact_text(skill_inputs.get("reason"))
    page_path = _resolve_page_path(skill_inputs)

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
    if action == "graph_edit":
        return _build_graph_edit_result(
            commands=commands,
            target_id=target_id,
            graph_edit_intents=graph_edit_intents,
            cursor_lifecycle=cursor_lifecycle,
            reason=reason,
            page_path=page_path,
        )
    if action != "click":
        return _failed(
            code="unsupported_action",
            message="TooGraph 页面操作器只支持 click 或 graph_edit 命令。",
            recoverable=True,
            detail={"commands": commands},
        )
    command_info = KNOWN_CLICK_TARGETS.get(command, {})
    target_id = _compact_text(command_info.get("target_id")) or target_id
    target_label = _compact_text(command_info.get("target_label")) or target_id

    operation = {
        "kind": "click",
        "target_id": target_id,
        "target_label": target_label,
    }
    operation_request = {
        "version": 1,
        "commands": commands,
        "operations": [operation],
        "cursor_lifecycle": cursor_lifecycle,
        "reason": reason,
    }
    journal_entry = {
        "kind": "click",
        "command": command,
        "target_id": target_id,
        "target_label": target_label,
        "status": "requested",
        "reason": reason,
    }
    return {
        "ok": True,
        "cursor_session_id": "",
        "journal": [journal_entry],
        "error": None,
        "activity_events": [
            {
                "kind": "virtual_ui_operation",
                "summary": f"Requested virtual click on {target_label}.",
                "status": "requested",
                "detail": {
                    "commands": commands,
                    "operation_request": operation_request,
                    "operation": operation,
                    "cursor_lifecycle": cursor_lifecycle,
                    "journal": [journal_entry],
                    "reason": reason,
                },
            }
        ],
    }


def _build_graph_edit_result(
    *,
    commands: list[str],
    target_id: str,
    graph_edit_intents: list[dict[str, Any]],
    cursor_lifecycle: str,
    reason: str,
    page_path: str,
) -> dict[str, Any]:
    if target_id != "editor.graph.playback":
        return _failed(
            code="unsupported_graph_edit_target",
            message="图编辑命令只能使用 graph_edit editor.graph.playback。",
            recoverable=True,
            detail={"commands": commands, "target_id": target_id},
        )
    if not _is_editor_page(page_path):
        return _failed(
            code="graph_edit_requires_editor_page",
            message="图编辑回放只能在图编辑器页面执行。请先导航到 /editor。",
            recoverable=True,
            detail={"commands": commands, "page_path": page_path},
        )
    if not graph_edit_intents:
        return _failed(
            code="missing_graph_edit_intents",
            message="graph_edit 命令需要 graph_edit_intents 数组。",
            recoverable=True,
            detail={"commands": commands},
        )

    operation = {
        "kind": "graph_edit",
        "target_id": "editor.canvas.surface",
        "target_label": "图编辑器画布",
        "graph_edit_intents": graph_edit_intents,
    }
    operation_request = {
        "version": 1,
        "commands": commands,
        "operations": [operation],
        "cursor_lifecycle": cursor_lifecycle,
        "reason": reason,
    }
    journal_entry = {
        "kind": "graph_edit",
        "command": commands[0],
        "target_id": "editor.graph.playback",
        "target_label": "图编辑回放",
        "intent_count": len(graph_edit_intents),
        "status": "requested",
        "reason": reason,
    }
    return {
        "ok": True,
        "cursor_session_id": "",
        "journal": [journal_entry],
        "error": None,
        "activity_events": [
            {
                "kind": "virtual_ui_operation",
                "summary": "Requested virtual graph edit playback.",
                "status": "requested",
                "detail": {
                    "commands": commands,
                    "operation_request": operation_request,
                    "operation": operation,
                    "cursor_lifecycle": cursor_lifecycle,
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


def _normalize_graph_edit_intents(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, str):
        try:
            return _normalize_graph_edit_intents(json.loads(value))
        except json.JSONDecodeError:
            return []
    if isinstance(value, dict):
        return _normalize_graph_edit_intents(value.get("operations") or value.get("intents") or value.get("graph_edit_intents"))
    if not isinstance(value, list):
        return []

    intents: list[dict[str, Any]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        intent = _sanitize_graph_edit_intent(item)
        if intent:
            intents.append(intent)
    return intents


def _sanitize_graph_edit_intent(item: dict[str, Any]) -> dict[str, Any] | None:
    kind = _compact_text(item.get("kind"))
    if kind == "create_node":
        node_type = _compact_text(item.get("nodeType") or item.get("node_type"))
        if node_type not in {"input", "agent", "output", "condition"}:
            return None
        ref = _compact_text(item.get("ref"))
        if not ref:
            return None
        intent: dict[str, Any] = {"kind": "create_node", "ref": ref, "nodeType": node_type}
        _copy_optional_text(item, intent, "title")
        _copy_optional_text(item, intent, "description")
        _copy_optional_text(item, intent, "taskInstruction")
        _copy_optional_text(item, intent, "positionHint")
        position = _sanitize_position(item.get("position"))
        if position:
            intent["position"] = position
        return intent
    if kind == "update_node":
        node_ref = _compact_text(item.get("nodeRef") or item.get("node_ref"))
        if not node_ref:
            return None
        intent = {"kind": "update_node", "nodeRef": node_ref}
        _copy_optional_text(item, intent, "title")
        _copy_optional_text(item, intent, "description")
        _copy_optional_text(item, intent, "taskInstruction")
        return intent
    if kind == "create_state":
        ref = _compact_text(item.get("ref"))
        if not ref:
            return None
        intent = {"kind": "create_state", "ref": ref}
        _copy_optional_text(item, intent, "name")
        _copy_optional_text(item, intent, "description")
        _copy_optional_text(item, intent, "valueType")
        _copy_optional_text(item, intent, "color")
        if "value" in item:
            intent["value"] = item.get("value")
        return intent
    if kind == "bind_state":
        node_ref = _compact_text(item.get("nodeRef") or item.get("node_ref"))
        state_ref = _compact_text(item.get("stateRef") or item.get("state_ref"))
        mode = _compact_text(item.get("mode"))
        if not node_ref or not state_ref or mode not in {"read", "write"}:
            return None
        intent = {"kind": "bind_state", "nodeRef": node_ref, "stateRef": state_ref, "mode": mode}
        if item.get("required") is True:
            intent["required"] = True
        return intent
    if kind == "connect_nodes":
        source_ref = _compact_text(item.get("sourceRef") or item.get("source_ref"))
        target_ref = _compact_text(item.get("targetRef") or item.get("target_ref"))
        if not source_ref or not target_ref:
            return None
        return {"kind": "connect_nodes", "sourceRef": source_ref, "targetRef": target_ref}
    return None


def _copy_optional_text(source: dict[str, Any], target: dict[str, Any], key: str) -> None:
    value = _compact_text(source.get(key))
    if value:
        target[key] = value


def _sanitize_position(value: Any) -> dict[str, float] | None:
    if not isinstance(value, dict):
        return None
    position: dict[str, float] = {}
    for key in ("x", "y"):
        number = value.get(key)
        if isinstance(number, (int, float)):
            position[key] = float(number)
    return position or None


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


def _is_editor_page(page_path: str) -> bool:
    normalized = page_path.strip()
    return normalized == "/editor" or normalized.startswith("/editor/")


def _resolve_page_path(skill_inputs: dict[str, Any]) -> str:
    direct = _compact_text(skill_inputs.get("page_path"))
    if direct:
        return direct
    runtime_context = skill_inputs.get("runtime_context")
    if isinstance(runtime_context, dict):
        nested = _compact_text(runtime_context.get("page_path"))
        if nested:
            return nested
    env_context = _load_runtime_context_from_environment()
    return _compact_text(env_context.get("page_path"))


def _load_runtime_context_from_environment() -> dict[str, Any]:
    raw = os.environ.get("TOOGRAPH_SKILL_RUNTIME_CONTEXT", "")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


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

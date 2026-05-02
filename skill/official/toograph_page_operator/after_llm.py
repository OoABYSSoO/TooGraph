from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


SUPPORTED_CURSOR_LIFECYCLES = {"keep", "return_after_step", "return_at_end"}
AUTO_RESUME_STATE_KEYS = ["page_operation_context", "page_context", "operation_result"]
SUPPORTED_PAGE_ACTIONS = {"click", "focus", "clear", "type", "press", "wait"}
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
    runtime_context = _resolve_runtime_context(skill_inputs)
    page_path = _resolve_page_path(skill_inputs, runtime_context)
    operation_book = _resolve_operation_book(skill_inputs, runtime_context)

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

    action, target_id, payload = parsed
    command_match = _validate_current_operation_book_command(
        operation_book=operation_book,
        command=command,
        action=action,
        target_id=target_id,
        page_path=page_path,
    )
    if command_match is not None and command_match.get("ok") is False:
        return command_match

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
    if action not in SUPPORTED_PAGE_ACTIONS:
        return _failed(
            code="unsupported_action",
            message="TooGraph 页面操作器只支持 click、focus、clear、type、press、wait 或 graph_edit 命令。",
            recoverable=True,
            detail={"commands": commands},
        )
    if action == "type" and (not payload or payload == "<text>"):
        return _failed(
            code="missing_type_text",
            message="type 命令需要把 <text> 占位符替换为真实输入文本。",
            recoverable=True,
            detail={"commands": commands, "target_id": target_id},
        )
    if action == "press" and (not payload or payload == "<key>"):
        return _failed(
            code="missing_press_key",
            message="press 命令需要把 <key> 占位符替换为真实按键名称。",
            recoverable=True,
            detail={"commands": commands, "target_id": target_id},
        )

    return _build_page_operation_result(
        command=command,
        commands=commands,
        action=action,
        target_id=target_id,
        payload=payload,
        target_info=command_match,
        cursor_lifecycle=cursor_lifecycle,
        reason=reason,
    )


def _build_page_operation_result(
    *,
    command: str,
    commands: list[str],
    action: str,
    target_id: str,
    payload: str,
    target_info: dict[str, Any] | None,
    cursor_lifecycle: str,
    reason: str,
) -> dict[str, Any]:
    command_info = KNOWN_CLICK_TARGETS.get(command, {})
    target_id = _compact_text(target_info.get("target_id") if target_info else "") or _compact_text(command_info.get("target_id")) or target_id
    target_label = _compact_text(target_info.get("target_label") if target_info else "") or _compact_text(command_info.get("target_label")) or target_id

    if action == "wait":
        operation: dict[str, Any] = {
            "kind": "wait",
            "option": payload or target_id,
        }
    else:
        operation = {
            "kind": action,
            "target_id": target_id,
            "target_label": target_label,
        }
        if action == "type":
            operation["text"] = payload
        if action == "press":
            operation["key"] = payload
    operation_request = {
        "version": 1,
        "commands": commands,
        "operations": [operation],
        "cursor_lifecycle": cursor_lifecycle,
        "reason": reason,
    }
    operation_request_id = _operation_request_id(operation_request)
    operation_request["operation_request_id"] = operation_request_id
    journal_entry = {
        "kind": action,
        "command": command,
        "target_id": target_id,
        "target_label": target_label,
        "operation_request_id": operation_request_id,
        "status": "requested",
        "reason": reason,
    }
    return {
        "ok": True,
        "cursor_session_id": "",
        "operation_request_id": operation_request_id,
        "journal": [journal_entry],
        "error": None,
        "activity_events": [
            {
                "kind": "virtual_ui_operation",
                "summary": f"Requested virtual {action} on {target_label}.",
                "status": "requested",
                "detail": {
                    "commands": commands,
                    "operation_request_id": operation_request_id,
                    "operation_request": operation_request,
                    "expected_continuation": _expected_continuation(operation_request_id),
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
    operation_request_id = _operation_request_id(operation_request)
    operation_request["operation_request_id"] = operation_request_id
    journal_entry = {
        "kind": "graph_edit",
        "command": commands[0],
        "target_id": "editor.graph.playback",
        "target_label": "图编辑回放",
        "operation_request_id": operation_request_id,
        "intent_count": len(graph_edit_intents),
        "status": "requested",
        "reason": reason,
    }
    return {
        "ok": True,
        "cursor_session_id": "",
        "operation_request_id": operation_request_id,
        "journal": [journal_entry],
        "error": None,
        "activity_events": [
            {
                "kind": "virtual_ui_operation",
                "summary": "Requested virtual graph edit playback.",
                "status": "requested",
                "detail": {
                    "commands": commands,
                    "operation_request_id": operation_request_id,
                    "operation_request": operation_request,
                    "expected_continuation": _expected_continuation(operation_request_id),
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


def _validate_current_operation_book_command(
    *,
    operation_book: dict[str, Any] | None,
    command: str,
    action: str,
    target_id: str,
    page_path: str,
) -> dict[str, Any] | None:
    if not operation_book:
        return None

    book_path = _operation_book_page_path(operation_book)
    if book_path and page_path and _normalize_route_path(book_path) != _normalize_route_path(page_path):
        return _failed(
            code="stale_page_operation_book",
            message="当前页面操作书与实际页面路径不一致，请刷新页面上下文后重试。",
            recoverable=True,
            detail={"command": command, "page_path": page_path, "operation_book_path": book_path},
        )

    command_match = _find_operation_book_command(operation_book, action, target_id, command)
    if command_match:
        return command_match

    unavailable_reason = _find_unavailable_reason(operation_book, target_id)
    if unavailable_reason:
        return _failed(
            code="target_unavailable",
            message="目标在当前页面操作书中不可用。",
            recoverable=True,
            detail={"command": command, "target_id": target_id, "reason": unavailable_reason},
        )
    return _failed(
        code="command_not_in_operation_book",
        message="命令不在当前页面操作书中，可能来自过期页面上下文或不可见目标。",
        recoverable=True,
        detail={"command": command, "target_id": target_id},
    )


def _find_operation_book_command(
    operation_book: dict[str, Any],
    action: str,
    target_id: str,
    command: str,
) -> dict[str, Any] | None:
    parsed = _parse_command(command)
    if not parsed:
        return None
    _command_action, _command_target_id, payload = parsed
    for collection_key in ("allowedOperations", "inputs"):
        for operation in _list_records(operation_book.get(collection_key)):
            operation_target_id = _compact_text(operation.get("targetId"))
            if operation_target_id != target_id:
                continue
            for template in _list_text(operation.get("commands")):
                if _command_matches_template(template, action, target_id, payload):
                    return {
                        "target_id": operation_target_id,
                        "target_label": _compact_text(operation.get("label")) or operation_target_id,
                        "command_template": template,
                    }
    return None


def _command_matches_template(template: str, action: str, target_id: str, payload: str) -> bool:
    parsed_template = _parse_command(template)
    if not parsed_template:
        return False
    template_action, template_target_id, template_payload = parsed_template
    if template_action != action or template_target_id != target_id:
        return False
    if action in {"type", "press"}:
        placeholder = "<text>" if action == "type" else "<key>"
        if template_payload == placeholder:
            return bool(payload) and payload != placeholder
    return payload == template_payload


def _find_unavailable_reason(operation_book: dict[str, Any], target_id: str) -> str:
    for item in _list_records(operation_book.get("unavailable")):
        if _compact_text(item.get("targetId")) == target_id:
            return _compact_text(item.get("reason")) or "unavailable"
    return ""


def _operation_book_page_path(operation_book: dict[str, Any]) -> str:
    page = operation_book.get("page") if isinstance(operation_book.get("page"), dict) else {}
    return _compact_text(page.get("path"))


def _list_records(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _list_text(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_compact_text(item) for item in value if _compact_text(item)]


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


def _parse_command(command: str) -> tuple[str, str, str] | None:
    parts = command.strip().split(maxsplit=2)
    if len(parts) < 2:
        return None
    payload = parts[2].strip() if len(parts) == 3 else ""
    return parts[0].lower(), parts[1].strip(), payload


def _operation_request_id(operation_request: dict[str, Any]) -> str:
    canonical = json.dumps(operation_request, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"vop_{digest[:16]}"


def _expected_continuation(operation_request_id: str) -> dict[str, Any]:
    return {
        "mode": "auto_resume_after_ui_operation",
        "operation_request_id": operation_request_id,
        "resume_state_keys": list(AUTO_RESUME_STATE_KEYS),
    }


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
        if node_type not in {"input", "agent", "output", "condition", "subgraph"}:
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


def _resolve_runtime_context(skill_inputs: dict[str, Any]) -> dict[str, Any]:
    runtime_context = skill_inputs.get("runtime_context")
    if isinstance(runtime_context, dict):
        return runtime_context
    return _load_runtime_context_from_environment()


def _resolve_operation_book(skill_inputs: dict[str, Any], runtime_context: dict[str, Any]) -> dict[str, Any] | None:
    direct = skill_inputs.get("page_operation_book")
    if isinstance(direct, dict):
        return direct
    nested = runtime_context.get("page_operation_book")
    return nested if isinstance(nested, dict) else None


def _resolve_page_path(skill_inputs: dict[str, Any], runtime_context: dict[str, Any]) -> str:
    direct = _compact_text(skill_inputs.get("page_path"))
    if direct:
        return direct
    nested = _compact_text(runtime_context.get("page_path"))
    if nested:
        return nested
    operation_book = _resolve_operation_book(skill_inputs, runtime_context)
    return _operation_book_page_path(operation_book) if operation_book else ""


def _load_runtime_context_from_environment() -> dict[str, Any]:
    file_path = os.environ.get("TOOGRAPH_SKILL_RUNTIME_CONTEXT_FILE", "")
    if file_path:
        try:
            parsed = json.loads(Path(file_path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            parsed = {}
        if isinstance(parsed, dict):
            return parsed
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


def _normalize_route_path(value: str) -> str:
    path = value.split("?", 1)[0].split("#", 1)[0].strip()
    return path or "/"


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

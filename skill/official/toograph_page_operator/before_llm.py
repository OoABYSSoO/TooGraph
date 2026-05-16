from __future__ import annotations

import json
import sys
from typing import Any


DEFAULT_FORBIDDEN_NOTE = "伙伴页面、伙伴浮窗、伙伴形象和伙伴调试入口已过滤，不作为可操作内容返回。"


def toograph_page_operator_before_llm(**payload: Any) -> dict[str, str]:
    runtime_context = payload.get("runtime_context") if isinstance(payload.get("runtime_context"), dict) else {}
    raw_book = runtime_context.get("page_operation_book")
    page_path = _compact_text(runtime_context.get("page_path")) or _extract_book_path(raw_book) or "/"
    operation_book = _sanitize_operation_book(raw_book, page_path)
    available_commands = [
        command
        for operation in operation_book["allowedOperations"]
        for command in operation.get("commands", [])
    ]
    graph_edit_commands = [command for command in available_commands if command.startswith("graph_edit ")]
    context = {
        "current_page_path": page_path,
        "page_operation_book": operation_book,
        "available_commands": available_commands,
        "output_contract": {
            "commands": available_commands[:1],
            "graph_edit_intents": _example_graph_edit_intents() if graph_edit_commands else [],
            "cursor_lifecycle": "return_after_step",
            "reason": "用一句话说明为什么选择这些命令。",
        },
        "rules": [
            "commands 必须逐字来自 available_commands。",
            "一次只输出一条 commands 命令；普通页面操作使用 click，图编辑使用 graph_edit editor.graph.playback。",
            "选择 graph_edit editor.graph.playback 时，graph_edit_intents 必须是产品语义图编辑意图数组。",
            "graph_edit_intents 支持 create_node、create_state、bind_state、connect_nodes、update_node；不要描述双击、菜单、DOM selector 或坐标。",
            "不要输出 DOM selector、坐标、鼠标轨迹或截图描述。",
            "伙伴页面、伙伴浮窗、伙伴形象和调试入口不可操作。",
        ],
    }
    return {"context": json.dumps(context, ensure_ascii=False, indent=2)}


def _sanitize_operation_book(value: Any, page_path: str) -> dict[str, Any]:
    source = value if isinstance(value, dict) else {}
    page = source.get("page") if isinstance(source.get("page"), dict) else {}
    allowed_operations = []
    for operation in _list_records(source.get("allowedOperations")):
        target_id = _compact_text(operation.get("targetId"))
        if _is_self_surface_target(target_id):
            continue
        commands = [
            command
            for command in _list_text(operation.get("commands"))
            if _is_supported_command(command, target_id, page_path)
        ]
        if not commands:
            continue
        allowed_operations.append(
            {
                "targetId": target_id,
                "label": _compact_text(operation.get("label")),
                "role": _compact_text(operation.get("role")) or "unknown",
                "commands": commands,
                "resultHint": _sanitize_result_hint(operation.get("resultHint")),
            }
        )

    forbidden = _list_text(source.get("forbidden"))
    if DEFAULT_FORBIDDEN_NOTE not in forbidden:
        forbidden.append(DEFAULT_FORBIDDEN_NOTE)

    return {
        "page": {
            "path": _compact_text(page.get("path")) or page_path,
            "title": _compact_text(page.get("title")) or "当前页面",
            "snapshotId": _compact_text(page.get("snapshotId")),
        },
        "allowedOperations": allowed_operations,
        "inputs": [],
        "unavailable": _sanitize_unavailable(source.get("unavailable")),
        "forbidden": forbidden,
    }


def _sanitize_result_hint(value: Any) -> dict[str, str] | None:
    if not isinstance(value, dict):
        return None
    path = _compact_text(value.get("path"))
    return {"path": path} if path else None


def _sanitize_unavailable(value: Any) -> list[dict[str, str]]:
    unavailable = []
    for item in _list_records(value):
        target_id = _compact_text(item.get("targetId"))
        if _is_self_surface_target(target_id):
            continue
        unavailable.append(
            {
                "targetId": target_id,
                "label": _compact_text(item.get("label")),
                "reason": _compact_text(item.get("reason")),
            }
        )
    return unavailable


def _example_graph_edit_intents() -> list[dict[str, Any]]:
    return [
        {
            "kind": "create_node",
            "ref": "stable_reference_name",
            "nodeType": "input | agent | output | condition",
            "title": "节点标题",
            "description": "节点简介",
            "taskInstruction": "仅 agent 节点需要的单轮 LLM 任务说明",
        },
        {
            "kind": "create_state",
            "ref": "state_reference_name",
            "name": "状态名称",
            "valueType": "text",
        },
        {
            "kind": "bind_state",
            "nodeRef": "stable_reference_name",
            "stateRef": "state_reference_name",
            "mode": "read | write",
        },
        {
            "kind": "connect_nodes",
            "sourceRef": "source_node_ref",
            "targetRef": "target_node_ref",
        },
    ]


def _extract_book_path(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    page = value.get("page") if isinstance(value.get("page"), dict) else {}
    return _compact_text(page.get("path"))


def _list_records(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _list_text(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_compact_text(item) for item in value if _compact_text(item)]


def _is_supported_command(command: str, target_id: str, page_path: str) -> bool:
    parts = command.strip().split(maxsplit=1)
    if len(parts) != 2:
        return False
    action = parts[0].lower()
    command_target_id = parts[1].strip()
    if target_id and command_target_id != target_id:
        return False
    if action not in {"click", "graph_edit"}:
        return False
    if action == "graph_edit" and command_target_id != "editor.graph.playback":
        return False
    if action == "graph_edit" and not _is_editor_page(page_path):
        return False
    return not _is_self_surface_target(command_target_id)


def _is_editor_page(page_path: str) -> bool:
    normalized = page_path.strip()
    return normalized == "/editor" or normalized.startswith("/editor/")


def _is_self_surface_target(target_id: str) -> bool:
    normalized = target_id.strip().lower()
    return (
        not normalized
        or normalized.startswith("buddy.")
        or normalized == "app.nav.buddy"
        or "mascot" in normalized
        or "debug" in normalized
        or "伙伴" in normalized
        or "调试" in normalized
    )


def _compact_text(value: Any) -> str:
    return str(value or "").strip()


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(toograph_page_operator_before_llm(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

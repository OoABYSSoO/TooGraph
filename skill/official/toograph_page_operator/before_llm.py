from __future__ import annotations

import json
import sys
from typing import Any


SUPPORTED_COMMANDS = {
    "click app.nav.runs": {
        "target_id": "app.nav.runs",
        "target_label": "运行历史",
        "next_page_path": "/runs",
    }
}
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
    context = {
        "current_page_path": page_path,
        "page_operation_book": operation_book,
        "available_commands": available_commands,
        "output_contract": {
            "commands": available_commands[:1],
            "cursor_lifecycle": "return_after_step",
            "reason": "用一句话说明为什么选择这些命令。",
        },
        "rules": [
            "commands 必须逐字来自 available_commands。",
            "当前阶段一次只输出一条 commands 命令。",
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
            if command in SUPPORTED_COMMANDS and not _is_self_surface_command(command)
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


def _is_self_surface_command(command: str) -> bool:
    parts = command.split()
    return len(parts) >= 2 and _is_self_surface_target(parts[1])


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

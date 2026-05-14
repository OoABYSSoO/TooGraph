from __future__ import annotations

import json
import sys
from typing import Any


SUPPORTED_CURSOR_LIFECYCLES = {"keep", "return_after_step", "return_at_end"}
RUNS_TARGET_ALIASES = {
    "runs",
    "run",
    "run_history",
    "run history",
    "history",
    "histories",
    "运行",
    "运行页",
    "运行历史",
    "运行记录",
    "历史",
    "历史页",
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
    action = _normalize_token(skill_inputs.get("action"))
    target = _normalize_token(skill_inputs.get("target"))
    cursor_lifecycle = _normalize_cursor_lifecycle(skill_inputs.get("cursor_lifecycle"))

    if target in BUDDY_SELF_TARGETS or target.startswith("buddy."):
        return _failed(
            code="forbidden_self_surface",
            message="伙伴不能操作伙伴页面、伙伴浮窗或自己的形象。",
            recoverable=False,
        )
    if action not in {"click_nav", "click_navigation", "navigate"}:
        return _failed(
            code="unsupported_action",
            message="TooGraph Page Operator phase 1 only supports click_nav.",
            recoverable=True,
        )
    if target not in RUNS_TARGET_ALIASES:
        return _failed(
            code="unsupported_target",
            message="TooGraph Page Operator phase 1 only supports the Runs navigation target.",
            recoverable=True,
        )

    operation = {
        "kind": "click",
        "target_id": "app.nav.runs",
        "target_label": "运行历史",
    }
    journal_entry = {
        "kind": "click",
        "target_id": "app.nav.runs",
        "target_label": "运行历史",
        "status": "requested",
        "next_page_path": "/runs",
    }
    return {
        "ok": True,
        "next_page_path": "/runs",
        "cursor_session_id": "",
        "journal": [journal_entry],
        "error": None,
        "activity_events": [
            {
                "kind": "virtual_ui_operation",
                "summary": "Requested virtual click on app navigation Runs.",
                "status": "requested",
                "detail": {
                    "operation": operation,
                    "cursor_lifecycle": cursor_lifecycle,
                    "next_page_path": "/runs",
                    "journal": [journal_entry],
                },
            }
        ],
    }


def _failed(*, code: str, message: str, recoverable: bool) -> dict[str, Any]:
    error = {
        "code": code,
        "message": message,
        "recoverable": recoverable,
    }
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
                "detail": {"error": error},
                "error": message,
            }
        ],
    }


def _normalize_cursor_lifecycle(value: Any) -> str:
    normalized = _normalize_token(value)
    if normalized in SUPPORTED_CURSOR_LIFECYCLES:
        return normalized
    return "return_after_step"


def _normalize_token(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_")


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

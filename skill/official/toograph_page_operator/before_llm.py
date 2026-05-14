from __future__ import annotations

import json
import sys
from typing import Any


APP_NAVIGATION_OPERATIONS = [
    {
        "affordance_id": "app.nav.runs",
        "action": "click_nav",
        "target": "runs",
        "label": "运行历史",
        "aliases": ["runs", "run history", "history", "历史", "运行历史", "运行记录"],
        "next_page_path": "/runs",
        "description": "打开 TooGraph 运行历史页面。",
    }
]


def toograph_page_operator_before_llm(**payload: Any) -> dict[str, str]:
    graph_state = payload.get("graph_state")
    page_path = ""
    if isinstance(graph_state, dict):
        page_path = _compact_text(graph_state.get("page_path")) or _extract_path_from_page_context(graph_state.get("page_context"))
    page_path = _compact_text(payload.get("page_path")) or page_path or _extract_path_from_page_context(payload.get("page_context")) or "/"
    operation_book = {
        "current_page_path": page_path,
        "operation_book": {
            "allowed_operations": APP_NAVIGATION_OPERATIONS,
            "filtered_self_surfaces": "伙伴页面、伙伴浮窗、伙伴形象和伙伴调试入口已过滤，不作为可操作内容返回。",
        },
        "output_contract": {
            "action": "click_nav",
            "target": "runs",
            "cursor_lifecycle": "return_after_step",
        },
    }
    return {"context": json.dumps(operation_book, ensure_ascii=False, indent=2)}


def _extract_path_from_page_context(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    for line in value.splitlines():
        stripped = line.strip()
        if stripped.startswith("当前路径:"):
            return stripped.split(":", 1)[1].strip() or ""
    return ""


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

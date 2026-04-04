from __future__ import annotations

import json
import re
import sys
from typing import Any


def graphiteui_skill_builder(**skill_inputs: Any) -> dict[str, Any]:
    return {
        "skill_json": _normalize_skill_json(skill_inputs.get("skill_json")),
        "skill_md": _strip_markdown_fence(_as_text(skill_inputs.get("skill_md"))),
        "before_llm_py": _strip_markdown_fence(_as_text(skill_inputs.get("before_llm_py"))),
        "after_llm_py": _strip_markdown_fence(_as_text(skill_inputs.get("after_llm_py"))),
    }


def _normalize_skill_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        text = _strip_markdown_fence(value).strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def _strip_markdown_fence(value: str) -> str:
    stripped = value.strip()
    match = re.fullmatch(r"```[A-Za-z0-9_-]*\s*\n(?P<body>[\s\S]*?)\n?```", stripped)
    if not match:
        return stripped
    return match.group("body").strip()


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, indent=2)
    return str(value)


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(graphiteui_skill_builder(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

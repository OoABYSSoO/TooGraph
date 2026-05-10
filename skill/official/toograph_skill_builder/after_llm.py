from __future__ import annotations

import json
import re
import sys
from typing import Any


LEGACY_LOCAL_SETTING_FIELDS = {
    "autoSelectable",
    "capabilityPolicy",
    "capability_policy",
    "configured",
    "discoverable",
    "enabled",
    "executionTargets",
    "execution_targets",
    "health",
    "healthy",
    "hidden",
    "kind",
    "label",
    "mode",
    "requiresApproval",
    "requires_approval",
    "runPolicies",
    "run_policies",
    "scope",
    "selectable",
    "sideEffects",
    "side_effects",
    "supportedValueTypes",
    "supported_value_types",
    "targets",
    "trigger",
}


def toograph_skill_builder(**skill_inputs: Any) -> dict[str, Any]:
    skill_json = _normalize_skill_json(skill_inputs.get("skill_json"))
    skill_key = _normalize_skill_key(skill_inputs.get("skill_key"), skill_json)
    if skill_key:
        skill_json["skillKey"] = skill_key
    return {
        "skill_key": skill_key,
        "skill_json": skill_json,
        "skill_md": _strip_markdown_fence(_as_text(skill_inputs.get("skill_md"))),
        "before_llm_py": _strip_markdown_fence(_as_text(skill_inputs.get("before_llm_py"))),
        "after_llm_py": _strip_markdown_fence(_as_text(skill_inputs.get("after_llm_py"))),
        "requirements_txt": _strip_markdown_fence(_as_text(skill_inputs.get("requirements_txt"))),
    }


def _normalize_skill_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return _strip_legacy_local_settings(value)
    if isinstance(value, str):
        text = _strip_markdown_fence(value).strip()
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return {}
        return _strip_legacy_local_settings(parsed) if isinstance(parsed, dict) else {}
    return {}


def _strip_legacy_local_settings(value: dict[str, Any]) -> dict[str, Any]:
    return {str(key): item for key, item in value.items() if str(key) not in LEGACY_LOCAL_SETTING_FIELDS}


def _normalize_skill_key(value: Any, skill_json: dict[str, Any]) -> str:
    explicit = _strip_markdown_fence(_as_text(value)).strip()
    if explicit:
        return explicit
    return _strip_markdown_fence(_as_text(skill_json.get("skillKey") or skill_json.get("skill_key"))).strip()


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
    print(json.dumps(toograph_skill_builder(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

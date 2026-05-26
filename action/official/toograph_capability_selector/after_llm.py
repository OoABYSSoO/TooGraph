from __future__ import annotations

import json
import os
from pathlib import Path
import sys
from typing import Any


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from capability_catalog import (
    discover_capability_catalog,
    normalize_selected_capability,
    resolve_budget_context,
    resolve_permission_policy,
)


def toograph_capability_selector(**action_inputs: Any) -> dict[str, Any]:
    runtime_context = _resolve_runtime_context(action_inputs)
    permission_policy = resolve_permission_policy(runtime_context)
    catalog = discover_capability_catalog()
    return normalize_selected_capability(
        action_inputs.get("capability"),
        catalog=catalog,
        permission_policy=permission_policy,
        budget_context=resolve_budget_context(runtime_context) or resolve_budget_context(action_inputs),
    )


def _resolve_runtime_context(action_inputs: dict[str, Any]) -> dict[str, Any]:
    runtime_context = action_inputs.get("runtime_context")
    if isinstance(runtime_context, dict):
        return runtime_context
    inline = os.environ.get("TOOGRAPH_ACTION_RUNTIME_CONTEXT")
    if inline:
        try:
            value = json.loads(inline)
        except json.JSONDecodeError:
            value = {}
        if isinstance(value, dict):
            return value
    context_file = os.environ.get("TOOGRAPH_ACTION_RUNTIME_CONTEXT_FILE")
    if context_file:
        try:
            value = json.loads(Path(context_file).read_text(encoding="utf-8"))
        except Exception:
            value = {}
        if isinstance(value, dict):
            return value
    return {}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(toograph_capability_selector(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

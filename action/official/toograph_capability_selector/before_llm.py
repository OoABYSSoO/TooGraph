from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from capability_catalog import discover_capability_catalog, format_capability_catalog_context, resolve_permission_policy


def toograph_capability_selector_before_llm(**payload: Any) -> dict[str, str]:
    runtime_context = payload.get("runtime_context") if isinstance(payload.get("runtime_context"), dict) else {}
    catalog = discover_capability_catalog(permission_policy=resolve_permission_policy(runtime_context))
    context = format_capability_catalog_context(catalog)
    return {"context": context}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(toograph_capability_selector_before_llm(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))

from capability_catalog import DEFAULT_ORIGIN, build_capability_catalog_context  # noqa: E402


def toograph_capability_selector_before_llm(**payload: Any) -> dict[str, str]:
    runtime_context = payload.get("runtime_context") if isinstance(payload.get("runtime_context"), dict) else {}
    origin = str(runtime_context.get("origin") or payload.get("origin") or DEFAULT_ORIGIN).strip()
    return {"context": build_capability_catalog_context(origin=origin)}


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

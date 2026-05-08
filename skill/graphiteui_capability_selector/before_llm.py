from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))

from capability_catalog import DEFAULT_ORIGIN, build_capability_catalog_context  # noqa: E402


def graphiteui_capability_selector_before_llm(**payload: Any) -> dict[str, str]:
    graph_state = payload.get("graph_state")
    origin = ""
    if isinstance(graph_state, dict):
        origin = str(graph_state.get("origin") or "").strip()
    origin = str(payload.get("origin") or origin or DEFAULT_ORIGIN).strip()
    return {"context": build_capability_catalog_context(origin=origin)}


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(graphiteui_capability_selector_before_llm(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

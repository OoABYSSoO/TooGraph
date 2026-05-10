from __future__ import annotations

import json
from pathlib import Path
import sys
from typing import Any


SKILL_DIR = Path(__file__).resolve().parent
if str(SKILL_DIR) not in sys.path:
    sys.path.insert(0, str(SKILL_DIR))

from capability_catalog import normalize_selected_capability  # noqa: E402


def graphiteui_capability_selector(**skill_inputs: Any) -> dict[str, Any]:
    return normalize_selected_capability(**skill_inputs)


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(graphiteui_capability_selector(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

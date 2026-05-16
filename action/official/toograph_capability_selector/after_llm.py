from __future__ import annotations

import json
import sys
from typing import Any


PAGE_OPERATION_CAPABILITY = {
    "kind": "subgraph",
    "key": "toograph_page_operation_workflow",
}


def toograph_capability_selector(**_action_inputs: Any) -> dict[str, Any]:
    return {
        "capability": dict(PAGE_OPERATION_CAPABILITY),
        "found": True,
    }


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

from __future__ import annotations

import json
import sys
from typing import Any


def graphiteui_script_tester_before_llm(**_payload: Any) -> dict[str, str]:
    return {
        "context": "\n".join(
            [
                "GraphiteUI Script Tester guidance:",
                "- Generate only script_filename, script_source, test_filename, and test_source.",
                "- script_source must be the complete Python script to test.",
                "- test_source must be complete pytest code that can run with `python -m pytest -q test_filename`.",
                "- Keep tests deterministic; do not use network access, wall-clock assumptions, repository files, or sensitive paths.",
                "- Cover the expected path plus meaningful edge cases from the user's requirement.",
                "- If the target script is a CLI, use subprocess in the test and call the script file from the temporary test directory.",
                "- Prefer direct imports for library-like scripts and clear assertions for expected outputs/errors.",
            ]
        )
    }


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    print(json.dumps(graphiteui_script_tester_before_llm(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

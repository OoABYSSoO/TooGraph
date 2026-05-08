from __future__ import annotations

import json
import sys
from typing import Any


def local_workspace_executor_before_llm(**_payload: Any) -> dict[str, str]:
    return {
        "context": "\n".join(
            [
                "Local Workspace Executor policy:",
                "- action must be one of: read, list, write, append, execute.",
                "- read/list paths must be under backend/data, skill, docs, README.md, or AGENTS.md.",
                "- write/append paths must be under backend/data.",
                "- execute paths must be under backend/data/tmp or backend/data/skills/user.",
                "- denied roots always fail: .git, .env, backend/data/settings.",
                "- execute supports script files with .py, .js, .mjs, .sh, .bat, or .ps1 extensions.",
                "- Return only the skill input fields; the runtime returns content, stdout, stderr, exit_code, and errors.",
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
    print(json.dumps(local_workspace_executor_before_llm(**payload), ensure_ascii=False))


if __name__ == "__main__":
    main()

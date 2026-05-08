from __future__ import annotations

import json
import platform
import shutil
import sys
from typing import Any


ALLOWED_COMMANDS = ["python", "python3", "node", "npm", "bash", "sh", "pwsh", "powershell", "cmd"]


def graphiteui_script_tester_before_llm(**_payload: Any) -> dict[str, str]:
    available_commands = _list_available_commands()
    return {
        "context": "\n".join(
            [
                "System context:",
                f"- OS: {platform.platform()}",
                f"- Python executable: {sys.executable}",
                f"- Python version: {platform.python_version()}",
                f"- Available test commands: {', '.join(available_commands) if available_commands else 'none detected'}",
                "GraphiteUI Script Tester guidance:",
                "- Generate only files and command.",
                "- files must be an array of objects with path and content; include the target script, generated tests, and minimal helper/config files.",
                "- command must be an argument array using an available allowed command, for example [\"python\", \"-m\", \"pytest\", \"-q\", \"test_target.py\"].",
                "- Python tests can use pytest when appropriate; JavaScript tests can use node --test when the environment has node.",
                "- Keep tests deterministic; do not use network access, wall-clock assumptions, repository files, or sensitive paths.",
                "- Cover the expected path plus meaningful edge cases from the user's requirement.",
                "- If the target script is a CLI, call it from the temporary test directory with the same interpreter/runtime command.",
                "- Do not claim test results yourself; after_llm.py runs the command and returns success/result.",
            ]
        )
    }


def _list_available_commands() -> list[str]:
    available: list[str] = []
    for command in ALLOWED_COMMANDS:
        if command in {"python", "python3"}:
            available.append(command)
            continue
        if shutil.which(command):
            available.append(command)
    return available


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

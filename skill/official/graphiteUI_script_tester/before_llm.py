from __future__ import annotations

import json
import platform
import shutil
import sys
from pathlib import Path
from typing import Any


ALLOWED_COMMANDS = ["python", "python3", "node", "npm", "bash", "sh", "pwsh", "powershell", "cmd"]
MAX_REFERENCED_FILES = 8
MAX_REFERENCED_FILE_BYTES = 80_000
REPO_ROOT = Path(__file__).resolve().parents[3]
DENIED_PATH_ROOTS = [REPO_ROOT / ".git", REPO_ROOT / "backend" / "data" / "settings"]


def graphiteui_script_tester_before_llm(**payload: Any) -> dict[str, str]:
    available_commands = _list_available_commands()
    context_lines = [
        "System context:",
        f"- OS: {platform.platform()}",
        f"- Python executable: {sys.executable}",
        f"- Python version: {platform.python_version()}",
        f"- Available test commands: {', '.join(available_commands) if available_commands else 'none detected'}",
    ]
    referenced_file_lines = _format_referenced_file_context(payload.get("graph_state"))
    if referenced_file_lines:
        context_lines.extend(referenced_file_lines)
    context_lines.extend(
        [
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
    return {
        "context": "\n".join(context_lines)
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


def _format_referenced_file_context(graph_state: Any) -> list[str]:
    references = _collect_referenced_files(graph_state)
    if not references:
        return []

    lines = ["Referenced file contents:"]
    for source_key, file_path, content in references:
        lines.append(f"- state: {source_key}")
        lines.append(f"  path: {file_path}")
        lines.append("  content:")
        lines.extend(f"    {line}" for line in _fenced(content).splitlines())
    return lines


def _collect_referenced_files(graph_state: Any) -> list[tuple[str, Path, str]]:
    references: list[tuple[str, Path, str]] = []
    seen_paths: set[Path] = set()
    for source_key, raw_value in _iter_string_values(graph_state):
        file_path = _resolve_referenced_file_path(raw_value)
        if file_path is None or file_path in seen_paths:
            continue
        content = _read_text_preview(file_path)
        if content is None:
            continue
        references.append((source_key, file_path, content))
        seen_paths.add(file_path)
        if len(references) >= MAX_REFERENCED_FILES:
            break
    return references


def _iter_string_values(value: Any, key_path: str = "graph_state") -> list[tuple[str, str]]:
    if isinstance(value, str):
        return [(key_path, value)]
    if isinstance(value, list):
        values: list[tuple[str, str]] = []
        for index, item in enumerate(value):
            values.extend(_iter_string_values(item, f"{key_path}[{index}]"))
        return values
    if isinstance(value, dict):
        values = []
        for key, item in value.items():
            child_key_path = str(key) if key_path == "graph_state" else f"{key_path}.{key}"
            values.extend(_iter_string_values(item, child_key_path))
        return values
    return []


def _resolve_referenced_file_path(raw_value: str) -> Path | None:
    candidate = raw_value.strip()
    if not candidate or "\n" in candidate or len(candidate) > 4096:
        return None
    if candidate.startswith("file://"):
        candidate = candidate.removeprefix("file://")
    try:
        path = Path(candidate).expanduser()
    except RuntimeError:
        return None
    if not path.is_absolute():
        path = REPO_ROOT / path
    try:
        resolved = path.resolve(strict=True)
    except OSError:
        return None
    if not resolved.is_file() or _is_sensitive_path(resolved):
        return None
    return resolved


def _is_sensitive_path(path: Path) -> bool:
    if any(part.startswith(".env") for part in path.parts):
        return True
    for root in DENIED_PATH_ROOTS:
        try:
            path.relative_to(root.resolve())
            return True
        except ValueError:
            continue
    return False


def _read_text_preview(path: Path) -> str | None:
    try:
        with path.open("rb") as handle:
            data = handle.read(MAX_REFERENCED_FILE_BYTES + 1)
    except OSError:
        return None
    if b"\x00" in data:
        return None
    truncated = len(data) > MAX_REFERENCED_FILE_BYTES
    text = data[:MAX_REFERENCED_FILE_BYTES].decode("utf-8", errors="replace")
    if truncated:
        text = f"{text}\n... [truncated after {MAX_REFERENCED_FILE_BYTES} bytes]"
    return text


def _fenced(value: str) -> str:
    return f"```text\n{value}\n```"


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

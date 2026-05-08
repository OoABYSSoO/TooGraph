from __future__ import annotations

import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Iterable


MAX_READ_CONTEXT_CHARS = 120_000
MAX_CONTEXT_FILES = 5
DENIED_ROOTS = [".git", ".env", "backend/data/settings"]
PATH_PATTERN = re.compile(
    r"(?:(?:backend|docs|skill|scripts|frontend|demo)/[^\s`'\"<>，。；、]+|README\.md|AGENTS\.md|package\.json|pyproject\.toml)"
)


def local_workspace_executor_before_llm(**payload: Any) -> dict[str, str]:
    repo_root = _repo_root()
    graph_state = payload.get("graph_state") if isinstance(payload.get("graph_state"), dict) else {}
    task_instruction = _task_instruction(payload)
    candidate_paths = _candidate_paths(graph_state, task_instruction)

    lines = [
        "Local Workspace Executor policy:",
        "- Generate skill input fields: path, operation, and content only when operation is write.",
        "- operation must be one of: read, write, execute.",
        "- read is a pre-LLM context aid: existing repository files below are read before planning, including non-artifact files.",
        "- write creates or overwrites one text file and is limited to backend/data.",
        "- execute runs one script file and is limited to backend/data/tmp or backend/data/skills/user.",
        "- denied roots always fail: .git, .env, backend/data/settings.",
        "- If a target path does not exist, only write can create it; read or execute will fail.",
    ]

    if candidate_paths:
        lines.append("")
        lines.append("Pre-read file context:")
        for raw_path in candidate_paths[:MAX_CONTEXT_FILES]:
            lines.extend(_format_path_context(repo_root, raw_path))

    return {"context": "\n".join(lines)}


def _task_instruction(payload: dict[str, Any]) -> str:
    direct = payload.get("task_instruction")
    if isinstance(direct, str):
        return direct
    node = payload.get("node")
    if isinstance(node, dict) and isinstance(node.get("task_instruction"), str):
        return str(node["task_instruction"])
    return ""


def _candidate_paths(graph_state: dict[str, Any], task_instruction: str) -> list[str]:
    texts = list(_iter_strings(graph_state))
    if task_instruction:
        texts.append(_replace_placeholders(task_instruction, graph_state))

    seen: set[str] = set()
    paths: list[str] = []
    for text in texts:
        for candidate in _paths_from_text(text):
            if candidate not in seen:
                seen.add(candidate)
                paths.append(candidate)
    return paths


def _paths_from_text(text: str) -> Iterable[str]:
    trimmed = _clean_path(text)
    if _looks_like_path(trimmed):
        yield trimmed
    for match in PATH_PATTERN.finditer(text):
        candidate = _clean_path(match.group(0))
        if _looks_like_path(candidate):
            yield candidate


def _looks_like_path(value: str) -> bool:
    if not value or "\n" in value or "\r" in value:
        return False
    if any(char.isspace() for char in value):
        return False
    if value in {"README.md", "AGENTS.md", "package.json", "pyproject.toml"}:
        return True
    return "/" in value and not value.startswith(("http://", "https://"))


def _replace_placeholders(text: str, graph_state: dict[str, Any]) -> str:
    next_text = text
    for key, value in graph_state.items():
        if isinstance(value, (str, int, float)):
            next_text = next_text.replace(f"<{key}>", str(value))
    return next_text


def _iter_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from _iter_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_strings(child)


def _format_path_context(repo_root: Path, raw_path: str) -> list[str]:
    resolved = _resolve_read_path(repo_root, raw_path)
    if isinstance(resolved, dict):
        return [f"- `{raw_path}`: {resolved['type']}: {resolved['message']}"]

    display_path = _display_path(repo_root, resolved)
    if not resolved.exists():
        return [f"- `{display_path}`: path does not exist; only write can create it."]
    if not resolved.is_file():
        return [f"- `{display_path}`: path exists but is not a file."]

    content = resolved.read_text(encoding="utf-8", errors="replace")
    truncated = content[:MAX_READ_CONTEXT_CHARS]
    lines = [
        f"- `{display_path}` exists and was read before planning ({len(content)} characters).",
        "  content:",
    ]
    lines.extend(f"    {line}" for line in truncated.splitlines())
    if len(content) > MAX_READ_CONTEXT_CHARS:
        lines.append("    [truncated]")
    return lines


def _resolve_read_path(repo_root: Path, value: str) -> Path | dict[str, str]:
    raw_path = _clean_path(value)
    if not raw_path:
        return {"type": "invalid_path", "message": "path is required."}
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = repo_root / candidate
    resolved = candidate.resolve(strict=False)
    if not _is_within(resolved, repo_root):
        return {"type": "permission_denied", "message": "Path must stay inside the GraphiteUI repository."}
    for denied in DENIED_ROOTS:
        denied_path = (repo_root / denied).resolve(strict=False)
        if _is_within(resolved, denied_path):
            return {"type": "permission_denied", "message": f"Path is inside denied root `{denied}`."}
    return resolved


def _clean_path(value: str) -> str:
    return str(value or "").strip().strip("`'\"<> \t\r\n,.;:，。；：、)")


def _is_within(path: Path, root: Path) -> bool:
    return path == root or path.is_relative_to(root)


def _repo_root() -> Path:
    configured = os.environ.get("GRAPHITE_REPO_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[2]


def _display_path(repo_root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        return str(path)


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

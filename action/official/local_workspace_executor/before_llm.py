from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any


MAX_READ_CONTEXT_CHARS = 120_000
MAX_CONTEXT_FILES = 5
DENIED_ROOTS = [".git", ".env", "backend/data/settings"]


def local_workspace_executor_before_llm(**payload: Any) -> dict[str, str]:
    repo_root = _repo_root()
    runtime_context = payload.get("runtime_context") if isinstance(payload.get("runtime_context"), dict) else {}
    candidate_paths = _candidate_paths(runtime_context)

    lines = [
        "本地工作区执行器 policy:",
        "- Generate only LLM parameter fields needed by one operation.",
        "- operation must be one of: read, list, search, edit, write, execute.",
        "- read/list/search are repository read operations and never write files.",
        "- read is a pre-LLM context aid: existing repository files below are read before planning, including non-artifact files.",
        "- list returns readable text files below the selected path and reports skipped entries.",
        "- search finds matching lines below the selected path and reports skipped entries.",
        "- edit replaces old_string with new_string in one existing text file; use replace_all only when every match is intended.",
        "- edit and overwriting write require expected_sha256 and expected_mtime_ns from the pre-read snapshot below.",
        "- write creates one text file or overwrites one text file with a matching snapshot; it is limited to backend/data, action/user, graph_template/user, or node_preset/user.",
        "- execute runs one script file and may include args as a JSON array; execution is limited to backend/data/tmp or action/user.",
        "- denied roots always fail: .git, .env, backend/data/settings.",
        "- If a target path does not exist, only write can create it; read, edit, or execute will fail.",
    ]

    if candidate_paths:
        lines.append("")
        lines.append("Pre-read file context:")
        for raw_path in candidate_paths[:MAX_CONTEXT_FILES]:
            lines.extend(_format_path_context(repo_root, raw_path))

    return {"context": "\n".join(lines)}


def _candidate_paths(runtime_context: dict[str, Any]) -> list[str]:
    seen: set[str] = set()
    paths: list[str] = []
    for candidate in _iter_runtime_path_hints(runtime_context):
        if candidate not in seen:
            seen.add(candidate)
            paths.append(candidate)
    return paths


def _iter_runtime_path_hints(runtime_context: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in ("candidate_paths", "referenced_paths", "file_paths", "paths"):
        values.extend(_iter_strings(runtime_context.get(key)))
    return [_clean_path(value) for value in values if _clean_path(value)]


def _iter_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        values: list[str] = []
        for child in value.values():
            values.extend(_iter_strings(child))
        return values
    if isinstance(value, list):
        values = []
        for child in value:
            values.extend(_iter_strings(child))
        return values
    return []


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
    snapshot = _file_snapshot(resolved)
    truncated = content[:MAX_READ_CONTEXT_CHARS]
    lines = [
        f"- `{display_path}` exists and was read before planning ({len(content)} characters).",
        f"  sha256: {snapshot['sha256']}",
        f"  mtime_ns: {snapshot['mtime_ns']}",
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
        return {"type": "permission_denied", "message": "Path must stay inside the TooGraph repository."}
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
    configured = os.environ.get("TOOGRAPH_REPO_ROOT")
    if configured:
        return Path(configured).resolve()
    return Path(__file__).resolve().parents[3]


def _display_path(repo_root: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo_root)).replace("\\", "/")
    except ValueError:
        return str(path)


def _file_snapshot(path: Path) -> dict[str, Any]:
    return {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "mtime_ns": path.stat().st_mtime_ns,
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

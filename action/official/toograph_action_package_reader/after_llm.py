from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any


VALID_SCOPE = {"user", "official"}
SKIP_DIRS = {"__pycache__", ".venv", "venv", "node_modules", ".mypy_cache", ".pytest_cache"}
SKIP_SUFFIXES = {".pyc", ".pyo", ".so", ".dll", ".dylib"}
MAX_FILE_BYTES = 200_000
MAX_TOTAL_BYTES = 800_000


def toograph_action_package_reader(**action_inputs: Any) -> dict[str, Any]:
    action_key = _normalize_action_key(action_inputs.get("action_key") or action_inputs.get("target_action_key"))
    if not action_key:
        return _failure("Invalid action_key. Use letters, numbers, underscores, or hyphens only.")

    requested_scope = _normalize_scope(action_inputs.get("source_scope"))
    repo_root = _repo_root()
    candidates = _candidate_roots(repo_root, action_key, requested_scope)
    for scope, action_dir in candidates:
        if action_dir.is_dir():
            package = _read_package(action_key=action_key, source_scope=scope, action_dir=action_dir, repo_root=repo_root)
            return {
                "success": True,
                "action_package": package,
                "result": f"Read {package['file_count']} files from {scope} action '{action_key}'.",
                "activity_events": [
                    {
                        "kind": "action_package_read",
                        "summary": f"Read Action package {action_key}.",
                        "status": "succeeded",
                        "detail": {
                            "action_key": action_key,
                            "source_scope": scope,
                            "file_count": package["file_count"],
                            "omitted_count": len(package["omitted_files"]),
                        },
                    }
                ],
            }

    scope_text = requested_scope or "user or official"
    return _failure(f"Action '{action_key}' was not found in {scope_text} packages.")


def _read_package(*, action_key: str, source_scope: str, action_dir: Path, repo_root: Path) -> dict[str, Any]:
    files: dict[str, str] = {}
    omitted: list[dict[str, str]] = []
    total_bytes = 0
    for path in sorted(item for item in action_dir.rglob("*") if item.is_file()):
        relative = path.relative_to(action_dir).as_posix()
        if _should_skip(path, relative):
            omitted.append({"path": relative, "reason": "runtime_artifact"})
            continue
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            omitted.append({"path": relative, "reason": "file_too_large"})
            continue
        if total_bytes + size > MAX_TOTAL_BYTES:
            omitted.append({"path": relative, "reason": "package_budget_exceeded"})
            continue
        try:
            files[relative] = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            omitted.append({"path": relative, "reason": "not_utf8"})
            continue
        total_bytes += size

    return {
        "kind": "action_package",
        "action_key": action_key,
        "source_scope": source_scope,
        "root": action_dir.relative_to(repo_root).as_posix(),
        "files": files,
        "omitted_files": omitted,
        "file_count": len(files),
        "total_bytes": total_bytes,
    }


def _should_skip(path: Path, relative: str) -> bool:
    if any(part in SKIP_DIRS for part in path.parts):
        return True
    if path.suffix in SKIP_SUFFIXES:
        return True
    if relative.startswith("."):
        return True
    return False


def _candidate_roots(repo_root: Path, action_key: str, requested_scope: str) -> list[tuple[str, Path]]:
    roots = {
        "user": repo_root / "action" / "user" / action_key,
        "official": repo_root / "action" / "official" / action_key,
    }
    if requested_scope in VALID_SCOPE:
        return [(requested_scope, roots[requested_scope])]
    return [("user", roots["user"]), ("official", roots["official"])]


def _normalize_action_key(value: Any) -> str:
    text = str(value or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,119}", text):
        return ""
    return text


def _normalize_scope(value: Any) -> str:
    text = str(value or "").strip().lower()
    return text if text in VALID_SCOPE else ""


def _failure(result: str) -> dict[str, Any]:
    return {"success": False, "action_package": {}, "result": result}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(toograph_action_package_reader(**payload), ensure_ascii=False))
